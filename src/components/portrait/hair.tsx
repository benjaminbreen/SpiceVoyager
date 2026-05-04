import React from 'react';
import type { PortraitConfig, SkinPalette, SocialClass } from '../../utils/portraitConfig';

// ── Facial hair ──────────────────────────────────────────

// Adjust a hex color's lightness by a delta (-1..1). Used to derive shadow + highlight tones from base hair color.
function shiftHex(hex: string, delta: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const f = (c: number) => {
    const v = delta >= 0 ? c + (255 - c) * delta : c * (1 + delta);
    return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  };
  return `#${f(r)}${f(g)}${f(b)}`;
}

function hairTexture(
  cx: number,
  headTop: number,
  hw: number,
  shadow: string,
  highlight: string,
): React.ReactNode {
  return (
    <g>
      <path d={`M ${cx - hw * 0.64} ${headTop + 8} Q ${cx - hw * 0.22} ${headTop + 1}, ${cx + hw * 0.18} ${headTop + 7}`}
        stroke={shadow} strokeWidth="1.6" fill="none" strokeLinecap="round" opacity={0.22} />
      <path d={`M ${cx - hw * 0.45} ${headTop + 12} Q ${cx - hw * 0.02} ${headTop + 4}, ${cx + hw * 0.48} ${headTop + 12}`}
        stroke={highlight} strokeWidth="1.1" fill="none" strokeLinecap="round" opacity={0.16} />
      <path d={`M ${cx + hw * 0.18} ${headTop + 9} Q ${cx + hw * 0.45} ${headTop + 5}, ${cx + hw * 0.68} ${headTop + 12}`}
        stroke={shadow} strokeWidth="1.2" fill="none" strokeLinecap="round" opacity={0.16} />
    </g>
  );
}

function beardTexture(
  cx: number,
  mouthY: number,
  chinY: number,
  width: number,
  shadow: string,
  highlight: string,
): React.ReactNode {
  return (
    <g>
      <path d={`M ${cx - width * 0.5} ${mouthY + 2} Q ${cx - width * 0.25} ${chinY - 2}, ${cx - width * 0.16} ${chinY + 6}`}
        stroke={shadow} strokeWidth="1.1" fill="none" strokeLinecap="round" opacity={0.28} />
      <path d={`M ${cx + width * 0.45} ${mouthY + 3} Q ${cx + width * 0.28} ${chinY - 1}, ${cx + width * 0.18} ${chinY + 5}`}
        stroke={shadow} strokeWidth="1.1" fill="none" strokeLinecap="round" opacity={0.24} />
      <path d={`M ${cx - width * 0.16} ${mouthY + 5} Q ${cx} ${chinY - 1}, ${cx + width * 0.08} ${chinY + 7}`}
        stroke={highlight} strokeWidth="0.75" fill="none" strokeLinecap="round" opacity={0.22} />
    </g>
  );
}

function beardEdgeBreakup(
  cx: number,
  y: number,
  width: number,
  rng: () => number,
  color: string,
): React.ReactNode {
  return (
    <g>
      {Array.from({ length: 7 }).map((_, i) => {
        const t = (i + 0.5) / 7;
        const x = cx - width + t * width * 2;
        const len = 1.5 + rng() * 2;
        return (
          <path key={`be${i}`} d={`M ${x} ${y - rng()} l ${(rng() - 0.5) * 0.8} ${len}`}
            stroke={color} strokeWidth="0.8" strokeLinecap="round" opacity={0.58} />
        );
      })}
    </g>
  );
}

type BeardStyle = 'vandyke' | 'spade' | 'pointed' | 'fullBushy' | 'square' | 'patriarch' | 'goatee' | 'chinStrap' | 'stubble' | 'mustacheOnly';

export function renderFacialHair(
  config: PortraitConfig, rng: () => number,
  cx: number, mouthY: number, _mouthW: number,
  chinY: number, jawW: number, headWidth: number, hairColor: string,
): React.ReactNode {
  const age = ['20s', '30s', '40s', '50s', '60s'].indexOf(config.age);
  // Young men: usually clean-shaven or stubble
  if (age === 0 && rng() > 0.35) return null;

  const grow = rng();
  const cg = config.culturalGroup;

  const beardLikelihood =
    cg === 'ArabPersian' ? 0.88 :
    cg === 'Indian' ? 0.78 :
    cg === 'NorthEuropean' ? 0.55 :
    cg === 'SouthEuropean' ? 0.62 :
    cg === 'EastAsian' ? 0.18 :
    cg === 'SoutheastAsian' ? 0.22 :
    cg === 'Swahili' ? 0.6 : 0.45;

  if (grow > beardLikelihood + 0.12) return null;

  // ── Pick a culturally-weighted style ──
  const styleRoll = rng();
  let style: BeardStyle;
  if (cg === 'ArabPersian' || cg === 'Indian') {
    // Trimmed full or patriarchal flowing styles dominate
    style = age >= 3 && styleRoll > 0.55 ? 'patriarch' :
            styleRoll > 0.35 ? 'fullBushy' :
            styleRoll > 0.15 ? 'square' : 'pointed';
  } else if (cg === 'NorthEuropean' || cg === 'SouthEuropean') {
    // Van Dyke and spade beards were the height of fashion c.1610s
    style = styleRoll > 0.7 ? 'vandyke' :
            styleRoll > 0.5 ? 'spade' :
            styleRoll > 0.35 ? 'pointed' :
            styleRoll > 0.22 ? 'fullBushy' :
            styleRoll > 0.12 ? 'mustacheOnly' :
            styleRoll > 0.06 ? 'goatee' : 'stubble';
  } else if (cg === 'EastAsian') {
    style = styleRoll > 0.6 ? 'patriarch' :
            styleRoll > 0.3 ? 'pointed' : 'mustacheOnly';
  } else if (cg === 'SoutheastAsian') {
    style = styleRoll > 0.5 ? 'goatee' : styleRoll > 0.25 ? 'mustacheOnly' : 'stubble';
  } else if (cg === 'Swahili') {
    style = styleRoll > 0.55 ? 'fullBushy' :
            styleRoll > 0.3 ? 'chinStrap' :
            styleRoll > 0.15 ? 'stubble' : 'goatee';
  } else {
    style = styleRoll > 0.5 ? 'fullBushy' : styleRoll > 0.25 ? 'goatee' : 'stubble';
  }

  // Outdoor working sailors more often have unkempt full or stubble
  if (config.isSailor && rng() > 0.6 && (cg === 'NorthEuropean' || cg === 'SouthEuropean')) {
    style = rng() > 0.5 ? 'fullBushy' : 'stubble';
  }

  // ── Tonal palette derived from hair color ──
  const shadow = shiftHex(hairColor, -0.35);
  const highlight = shiftHex(hairColor, 0.25);
  const isLight = hairColor === '#888888' || hairColor === '#b0b0b0' ||
    hairColor === '#d4a860' || hairColor === '#e0c880';
  const strandColor = isLight ? shiftHex(hairColor, -0.2) : shiftHex(hairColor, 0.15);
  const greying = age >= 4 && rng() > 0.4;

  return (
    <g key="facial-hair">
      {renderBeardStyle(style, cx, mouthY, chinY, jawW, headWidth, rng, hairColor, shadow, highlight, strandColor, greying, age)}
    </g>
  );
}

function renderBeardStyle(
  style: BeardStyle,
  cx: number, mouthY: number, chinY: number, jawW: number, headWidth: number,
  rng: () => number,
  base: string, shadow: string, highlight: string, strand: string,
  greying: boolean, age: number,
): React.ReactNode {
  const greyOverlay = greying ? '#c8c0b8' : null;
  // Most styles include a mustache; we render that here separately and compose.
  const mustacheStyle: 'walrus' | 'handlebar' | 'imperial' | 'trimmed' | 'thin' | 'none' =
    style === 'goatee' || style === 'chinStrap' || style === 'stubble' ? 'none' :
    style === 'patriarch' ? (rng() > 0.4 ? 'walrus' : 'trimmed') :
    style === 'vandyke' ? (rng() > 0.5 ? 'imperial' : 'handlebar') :
    style === 'spade' ? (rng() > 0.6 ? 'handlebar' : 'walrus') :
    style === 'pointed' ? (rng() > 0.5 ? 'handlebar' : 'trimmed') :
    style === 'mustacheOnly' ? (rng() > 0.5 ? 'walrus' : rng() > 0.5 ? 'handlebar' : 'trimmed') :
    'trimmed';

  const beardEl = renderBeardShape(style, cx, mouthY, chinY, jawW, headWidth, rng, base, shadow, highlight, strand);
  const mustEl = mustacheStyle !== 'none'
    ? renderMustacheShape(mustacheStyle, cx, mouthY, rng, base, shadow, highlight)
    : null;

  return (
    <g>
      {beardEl}
      {mustEl}
      {greyOverlay && (
        // Grey-streak overlay — applied softly across the whole beard area
        <ellipse cx={cx} cy={chinY - 2} rx={jawW + 2} ry={(chinY - mouthY) + 8}
          fill={greyOverlay} opacity={0.18} />
      )}
    </g>
  );
}

function renderBeardShape(
  style: BeardStyle, cx: number, mouthY: number, chinY: number,
  jawW: number, headWidth: number, rng: () => number,
  base: string, shadow: string, highlight: string, strand: string,
): React.ReactNode {
  switch (style) {
    case 'fullBushy': {
      // Wraps the entire jaw, fairly long
      const bLen = 12 + rng() * 14;
      const fullness = 1 + rng() * 0.3;
      const path = `M ${cx - headWidth + 2} ${mouthY - 6}
        C ${cx - headWidth - 2} ${chinY - 4}, ${cx - jawW - 2} ${chinY + bLen - 4}, ${cx} ${chinY + bLen + 2}
        C ${cx + jawW + 2} ${chinY + bLen - 4}, ${cx + headWidth + 2} ${chinY - 4}, ${cx + headWidth - 2} ${mouthY - 6}
        C ${cx + 16 * fullness} ${mouthY + 4}, ${cx - 16 * fullness} ${mouthY + 4}, ${cx - headWidth + 2} ${mouthY - 6} Z`;
      return (
        <g>
          <path d={path} fill={shadow} transform={`translate(0, 1)`} opacity={0.85} />
          <path d={path} fill={base} />
          {beardTexture(cx, mouthY, chinY, jawW, shadow, highlight)}
          {/* Highlight streak down the center */}
          <path d={`M ${cx - jawW * 0.4} ${mouthY + 4} Q ${cx} ${chinY + bLen * 0.4} ${cx + jawW * 0.4} ${mouthY + 4}`}
            stroke={highlight} strokeWidth="1.5" fill="none" opacity={0.4} />
          {beardEdgeBreakup(cx, chinY + bLen + 1, jawW, rng, strand)}
          {strandsAlongCurve(cx - headWidth + 2, mouthY - 6, cx + headWidth - 2, mouthY - 6, cx, chinY + bLen + 2, 14, rng, strand, base, 4)}
        </g>
      );
    }
    case 'spade': {
      // Wide squared-off bottom — the classic Spanish/Habsburg court beard
      const bLen = 14 + rng() * 6;
      const flare = jawW - 4;
      const path = `M ${cx - flare} ${mouthY - 4}
        C ${cx - flare - 2} ${chinY - 2}, ${cx - flare - 6} ${chinY + bLen - 4}, ${cx - flare + 2} ${chinY + bLen}
        L ${cx + flare - 2} ${chinY + bLen}
        C ${cx + flare + 6} ${chinY + bLen - 4}, ${cx + flare + 2} ${chinY - 2}, ${cx + flare} ${mouthY - 4}
        C ${cx + 12} ${mouthY + 4}, ${cx - 12} ${mouthY + 4}, ${cx - flare} ${mouthY - 4} Z`;
      return (
        <g>
          <path d={path} fill={shadow} transform={`translate(0,1)`} opacity={0.9} />
          <path d={path} fill={base} />
          {beardTexture(cx, mouthY, chinY, flare, shadow, highlight)}
          {/* Center mid-line groove (combed beard) */}
          <path d={`M ${cx} ${mouthY + 5} L ${cx} ${chinY + bLen - 2}`}
            stroke={shadow} strokeWidth="0.6" opacity={0.5} />
          {/* Highlight on lit side */}
          <path d={`M ${cx + 4} ${mouthY + 6} Q ${cx + flare * 0.7} ${chinY + bLen * 0.4} ${cx + flare * 0.4} ${chinY + bLen - 2}`}
            stroke={highlight} strokeWidth="1.2" fill="none" opacity={0.4} />
          {beardEdgeBreakup(cx, chinY + bLen, flare, rng, strand)}
          {strandsAlongCurve(cx - flare, chinY + bLen - 2, cx + flare, chinY + bLen - 2, cx, chinY + bLen + 4, 10, rng, strand, base, 2.5)}
        </g>
      );
    }
    case 'vandyke': {
      // Pointed chin tuft + linked mustache (handled separately) — the gentleman's mark
      const tipLen = 12 + rng() * 8;
      const cw = 6 + rng() * 3;
      const path = `M ${cx - cw} ${mouthY + 3}
        C ${cx - cw - 2} ${chinY - 2}, ${cx - 2} ${chinY + tipLen}, ${cx} ${chinY + tipLen + 2}
        C ${cx + 2} ${chinY + tipLen}, ${cx + cw + 2} ${chinY - 2}, ${cx + cw} ${mouthY + 3}
        C ${cx + cw * 0.4} ${mouthY + 5}, ${cx - cw * 0.4} ${mouthY + 5}, ${cx - cw} ${mouthY + 3} Z`;
      return (
        <g>
          <path d={path} fill={shadow} transform="translate(0,1)" opacity={0.85} />
          <path d={path} fill={base} />
          {/* Center groove */}
          <path d={`M ${cx} ${mouthY + 5} L ${cx} ${chinY + tipLen}`}
            stroke={shadow} strokeWidth="0.5" opacity={0.6} />
          {/* Tip strand */}
          <path d={`M ${cx} ${chinY + tipLen + 2} l 0 3`} stroke={base} strokeWidth="1" strokeLinecap="round" />
        </g>
      );
    }
    case 'pointed': {
      // Narrow stiletto-pointed beard
      const tipLen = 10 + rng() * 12;
      const w = 7 + rng() * 4;
      const path = `M ${cx - w} ${mouthY - 2}
        C ${cx - w - 1} ${chinY - 2}, ${cx - 1} ${chinY + tipLen}, ${cx} ${chinY + tipLen + 3}
        C ${cx + 1} ${chinY + tipLen}, ${cx + w + 1} ${chinY - 2}, ${cx + w} ${mouthY - 2}
        C ${cx + w * 0.3} ${mouthY + 3}, ${cx - w * 0.3} ${mouthY + 3}, ${cx - w} ${mouthY - 2} Z`;
      return (
        <g>
          <path d={path} fill={shadow} transform="translate(0,1)" opacity={0.85} />
          <path d={path} fill={base} />
          <path d={`M ${cx} ${mouthY + 2} L ${cx + 0.5} ${chinY + tipLen + 1}`}
            stroke={highlight} strokeWidth="0.5" opacity={0.5} />
        </g>
      );
    }
    case 'square': {
      // Cropped square beard hugging the jaw
      const bLen = 4 + rng() * 6;
      const path = `M ${cx - jawW - 1} ${mouthY - 3}
        C ${cx - jawW - 3} ${chinY - 2}, ${cx - jawW + 2} ${chinY + bLen}, ${cx} ${chinY + bLen + 1}
        C ${cx + jawW - 2} ${chinY + bLen}, ${cx + jawW + 3} ${chinY - 2}, ${cx + jawW + 1} ${mouthY - 3}
        C ${cx + 14} ${mouthY + 3}, ${cx - 14} ${mouthY + 3}, ${cx - jawW - 1} ${mouthY - 3} Z`;
      return (
        <g>
          <path d={path} fill={shadow} opacity={0.85} transform="translate(0,1)" />
          <path d={path} fill={base} />
          {strandsAlongCurve(cx - jawW, chinY + bLen, cx + jawW, chinY + bLen, cx, chinY + bLen + 3, 8, rng, strand, base, 2)}
        </g>
      );
    }
    case 'patriarch': {
      // Long flowing beard — old wise men, scholars, imams
      const bLen = 26 + rng() * 18;
      const wave1 = (rng() - 0.5) * 4;
      const wave2 = (rng() - 0.5) * 4;
      const path = `M ${cx - jawW - 2} ${mouthY - 4}
        C ${cx - jawW - 8} ${chinY - 2}, ${cx - jawW - 6 + wave1} ${chinY + bLen * 0.5}, ${cx - jawW * 0.4} ${chinY + bLen}
        C ${cx - 4} ${chinY + bLen + 4}, ${cx + 4} ${chinY + bLen + 4}, ${cx + jawW * 0.4} ${chinY + bLen}
        C ${cx + jawW + 6 + wave2} ${chinY + bLen * 0.5}, ${cx + jawW + 8} ${chinY - 2}, ${cx + jawW + 2} ${mouthY - 4}
        C ${cx + 14} ${mouthY + 4}, ${cx - 14} ${mouthY + 4}, ${cx - jawW - 2} ${mouthY - 4} Z`;
      return (
        <g>
          <path d={path} fill={shadow} transform="translate(0,1.5)" opacity={0.9} />
          <path d={path} fill={base} />
          {beardTexture(cx, mouthY, chinY, jawW, shadow, highlight)}
          {/* Wavy strands flowing down the length */}
          {[0.3, 0.5, 0.7].map((t, i) => (
            <path key={`wv${i}`}
              d={`M ${cx - jawW * 0.4 + (i - 1) * 4} ${mouthY + 4 + t * (chinY + bLen - mouthY - 4)} q 2 4 0 8`}
              stroke={shadow} strokeWidth="0.5" fill="none" opacity={0.6} />
          ))}
          {/* Highlight along center */}
          <path d={`M ${cx} ${mouthY + 6} Q ${cx + 1} ${chinY + bLen * 0.5} ${cx} ${chinY + bLen}`}
            stroke={highlight} strokeWidth="1" fill="none" opacity={0.35} />
          {/* Strand wisps at the bottom tip */}
          {[-3, -1, 1, 3].map(dx => (
            <path key={`tip${dx}`}
              d={`M ${cx + dx} ${chinY + bLen + 2} l ${dx * 0.3} ${4 + rng() * 2}`}
              stroke={strand} strokeWidth="0.6" strokeLinecap="round" opacity={0.7} />
          ))}
        </g>
      );
    }
    case 'goatee': {
      // Small chin tuft, no mustache
      const w = 5 + rng() * 2.5;
      const len = 6 + rng() * 7;
      const topY = Math.max(mouthY + 7, chinY - 6);
      const path = `M ${cx - w} ${topY}
        C ${cx - w - 1} ${chinY - 1}, ${cx - 2.5} ${chinY + len - 1}, ${cx} ${chinY + len + 1}
        C ${cx + 2.5} ${chinY + len - 1}, ${cx + w + 1} ${chinY - 1}, ${cx + w} ${topY}
        C ${cx + w * 0.25} ${topY + 2}, ${cx - w * 0.25} ${topY + 2}, ${cx - w} ${topY} Z`;
      return (
        <g>
          <path d={path} fill={shadow} transform="translate(0,1)" opacity={0.85} />
          <path d={path} fill={base} />
          <path d={`M ${cx - w * 0.35} ${topY + 2} Q ${cx} ${chinY + len * 0.45}, ${cx} ${chinY + len}`}
            stroke={highlight} strokeWidth="0.55" fill="none" opacity={0.38} />
          <path d={`M ${cx} ${chinY + len + 1} l 0 ${2 + rng() * 1.5}`}
            stroke={base} strokeWidth="0.8" strokeLinecap="round" />
        </g>
      );
    }
    case 'chinStrap': {
      // Narrow band of hair following the jawline only — common in some African styles
      const r = rng;
      const sw = 1.6;
      return (
        <g>
          <path
            d={`M ${cx - headWidth + 4} ${mouthY - 2}
                C ${cx - headWidth - 1} ${chinY - 6}, ${cx - jawW - 2} ${chinY + 2}, ${cx} ${chinY + 4}
                C ${cx + jawW + 2} ${chinY + 2}, ${cx + headWidth + 1} ${chinY - 6}, ${cx + headWidth - 4} ${mouthY - 2}`}
            stroke={base} strokeWidth={sw + 0.5} fill="none" strokeLinecap="round" />
          <path
            d={`M ${cx - headWidth + 5} ${mouthY - 1}
                C ${cx - headWidth} ${chinY - 5}, ${cx - jawW - 1} ${chinY + 3}, ${cx} ${chinY + 5}
                C ${cx + jawW + 1} ${chinY + 3}, ${cx + headWidth} ${chinY - 5}, ${cx + headWidth - 5} ${mouthY - 1}`}
            stroke={shadow} strokeWidth={sw} fill="none" strokeLinecap="round" opacity={0.7} />
          {/* Scattered short hairs along the strap */}
          {Array.from({ length: 14 }).map((_, i) => {
            const t = (i + 0.5) / 14;
            const ang = Math.PI * t;
            const px = cx + Math.cos(ang) * (headWidth - 2) * (1 - t * 0.1);
            const py = mouthY - 2 + Math.sin(ang) * (chinY + 4 - mouthY + 4);
            return <circle key={`cs${i}`} cx={px} cy={py} r={0.6 + r() * 0.5} fill={base} opacity={0.7} />;
          })}
        </g>
      );
    }
    case 'stubble': {
      // A few days of growth — render as a shadow-filled region masked by fractal noise,
      // so the result reads as fine texture rather than a field of individual dots.
      const seed = Math.floor(rng() * 10000);
      const fid = `stb-${seed}`;
      const yMid = (mouthY + chinY) / 2 + 1;
      const yRad = (chinY - mouthY) / 2 + 4;
      return (
        <g key="stubble">
          <defs>
            <filter id={fid} x="-10%" y="-10%" width="120%" height="120%">
              <feTurbulence type="fractalNoise" baseFrequency="0.95" numOctaves="2" seed={seed} result="n" />
              {/* Map noise luminance to alpha with a hard threshold — keeps only the brighter speckles */}
              <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2.2 0 0 0 -0.7" result="mask" />
              <feComposite in="SourceGraphic" in2="mask" operator="in" />
            </filter>
          </defs>
          {/* Jaw & chin coverage — excludes the lip area */}
          <path d={`M ${cx - jawW} ${mouthY + 3}
              C ${cx - jawW - 1} ${chinY - 6}, ${cx - jawW * 0.5} ${chinY + 5}, ${cx} ${chinY + 6}
              C ${cx + jawW * 0.5} ${chinY + 5}, ${cx + jawW + 1} ${chinY - 6}, ${cx + jawW} ${mouthY + 3}
              C ${cx + jawW * 0.35} ${mouthY + 6}, ${cx - jawW * 0.35} ${mouthY + 6}, ${cx - jawW} ${mouthY + 3} Z`}
            fill={shadow} opacity={0.75} filter={`url(#${fid})`} />
          {/* Upper-lip / mustache shadow */}
          <ellipse cx={cx} cy={mouthY - 3.5} rx={12} ry={2.6}
            fill={shadow} opacity={0.7} filter={`url(#${fid})`} />
          {/* A faint soft wash underneath so the speckles sit on a hint of shadow, not bare skin */}
          <ellipse cx={cx} cy={yMid} rx={jawW - 2} ry={yRad}
            fill={shadow} opacity={0.08} />
        </g>
      );
    }
    case 'mustacheOnly':
      // No beard shape — just the mustache rendered separately by caller
      // But add a tiny bit of chin shadow to suggest stubble underneath
      return (
        <ellipse cx={cx} cy={chinY - 2} rx={jawW - 4} ry={6}
          fill={shadow} opacity={0.12} />
      );
  }
}

function renderMustacheShape(
  style: 'walrus' | 'handlebar' | 'imperial' | 'trimmed' | 'thin',
  cx: number, mouthY: number, rng: () => number,
  base: string, shadow: string, highlight: string,
): React.ReactNode {
  switch (style) {
    case 'walrus': {
      // Drooping, thick — covers the upper lip and droops past the corners
      const w = 16 + rng() * 5;
      const drop = 4 + rng() * 3;
      const thick = 4 + rng() * 1.5;
      const path = `M ${cx - w} ${mouthY - 2 + drop * 0.4}
        C ${cx - w * 0.6} ${mouthY - 6 - thick}, ${cx + w * 0.6} ${mouthY - 6 - thick}, ${cx + w} ${mouthY - 2 + drop * 0.4}
        L ${cx + w + 1} ${mouthY + drop}
        C ${cx + w * 0.4} ${mouthY + 1}, ${cx - w * 0.4} ${mouthY + 1}, ${cx - w - 1} ${mouthY + drop} Z`;
      return (
        <g key="must">
          <path d={path} fill={shadow} transform="translate(0,0.8)" opacity={0.85} />
          <path d={path} fill={base} />
          {/* Center groove under philtrum */}
          <path d={`M ${cx} ${mouthY - thick - 4} L ${cx} ${mouthY - 1}`}
            stroke={shadow} strokeWidth="0.6" opacity={0.55} />
          {/* Tip wisps drooping past corners */}
          <path d={`M ${cx - w - 1} ${mouthY + drop} l -2 ${1.5 + rng()}`}
            stroke={base} strokeWidth="1" strokeLinecap="round" />
          <path d={`M ${cx + w + 1} ${mouthY + drop} l 2 ${1.5 + rng()}`}
            stroke={base} strokeWidth="1" strokeLinecap="round" />
        </g>
      );
    }
    case 'handlebar': {
      // Curled-up tips — the dashing cavalier look
      const w = 14 + rng() * 5;
      const thick = 2.5 + rng() * 1.5;
      const curl = 4 + rng() * 2;
      const path = `M ${cx - w} ${mouthY - 2}
        C ${cx - w * 0.5} ${mouthY - 5 - thick}, ${cx + w * 0.5} ${mouthY - 5 - thick}, ${cx + w} ${mouthY - 2}
        C ${cx + w * 0.4} ${mouthY - 1}, ${cx - w * 0.4} ${mouthY - 1}, ${cx - w} ${mouthY - 2} Z`;
      return (
        <g key="must">
          <path d={path} fill={shadow} transform="translate(0,0.7)" opacity={0.85} />
          <path d={path} fill={base} />
          {/* Curled tips — thin tapered strokes that rise upward */}
          <path d={`M ${cx - w + 1} ${mouthY - 3}
              C ${cx - w - 3} ${mouthY - 4}, ${cx - w - curl} ${mouthY - 6}, ${cx - w - curl - 1} ${mouthY - 8}`}
            stroke={base} strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <path d={`M ${cx + w - 1} ${mouthY - 3}
              C ${cx + w + 3} ${mouthY - 4}, ${cx + w + curl} ${mouthY - 6}, ${cx + w + curl + 1} ${mouthY - 8}`}
            stroke={base} strokeWidth="1.6" fill="none" strokeLinecap="round" />
          {/* Highlight along upper edge */}
          <path d={`M ${cx - w + 3} ${mouthY - 4} Q ${cx} ${mouthY - 5 - thick * 0.6} ${cx + w - 3} ${mouthY - 4}`}
            stroke={highlight} strokeWidth="0.7" fill="none" opacity={0.45} />
        </g>
      );
    }
    case 'imperial': {
      // Narrow waxed mustache, sharply pointed — Charles I / Cardinal Richelieu look
      const w = 13 + rng() * 4;
      const thick = 1.6 + rng() * 0.8;
      const path = `M ${cx - w} ${mouthY - 2}
        C ${cx - w * 0.4} ${mouthY - 4 - thick}, ${cx + w * 0.4} ${mouthY - 4 - thick}, ${cx + w} ${mouthY - 2}
        C ${cx + w * 0.3} ${mouthY - 1}, ${cx - w * 0.3} ${mouthY - 1}, ${cx - w} ${mouthY - 2} Z`;
      return (
        <g key="must">
          <path d={path} fill={base} />
          {/* Sharp waxed points extending past corners */}
          <path d={`M ${cx - w + 1} ${mouthY - 3} l -5 -2`} stroke={base} strokeWidth="1.2" strokeLinecap="round" />
          <path d={`M ${cx + w - 1} ${mouthY - 3} l 5 -2`} stroke={base} strokeWidth="1.2" strokeLinecap="round" />
        </g>
      );
    }
    case 'trimmed': {
      // Neat compact mustache
      const w = 11 + rng() * 4;
      const thick = 2 + rng() * 1.5;
      const path = `M ${cx - w} ${mouthY - 2}
        C ${cx - w * 0.4} ${mouthY - 4 - thick}, ${cx + w * 0.4} ${mouthY - 4 - thick}, ${cx + w} ${mouthY - 2}
        C ${cx + w * 0.3} ${mouthY - 1}, ${cx - w * 0.3} ${mouthY - 1}, ${cx - w} ${mouthY - 2} Z`;
      return (
        <g key="must">
          <path d={path} fill={shadow} transform="translate(0,0.6)" opacity={0.8} />
          <path d={path} fill={base} />
          <path d={`M ${cx} ${mouthY - thick - 2} L ${cx} ${mouthY - 1}`}
            stroke={shadow} strokeWidth="0.5" opacity={0.5} />
        </g>
      );
    }
    case 'thin': {
      // Pencil mustache — barely there
      const w = 10 + rng() * 3;
      return (
        <path key="must"
          d={`M ${cx - w} ${mouthY - 2} Q ${cx} ${mouthY - 3.5} ${cx + w} ${mouthY - 2}`}
          stroke={base} strokeWidth="1.4" strokeLinecap="round" fill="none" />
      );
    }
  }
}

// Generate small hair strands radiating out from the bottom edge of a beard for fuzzy texture.
function strandsAlongCurve(
  x1: number, _y1: number, x2: number, _y2: number,
  apexX: number, apexY: number,
  count: number, rng: () => number,
  strandColor: string, baseColor: string, lengthBase: number,
): React.ReactNode {
  const strands: React.ReactNode[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    // Quadratic interpolation to find a point near the apex curve
    const px = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * apexX + t * t * x2;
    const py = (1 - t) * (1 - t) * _y1 + 2 * (1 - t) * t * apexY + t * t * _y2;
    const len = lengthBase * (0.6 + rng() * 0.8);
    // Direction roughly perpendicular to the curve, fanning slightly outward
    const dx = (px - apexX) * 0.2 + (rng() - 0.5) * 1.5;
    const dy = len * (0.7 + rng() * 0.4);
    const color = rng() > 0.5 ? strandColor : baseColor;
    strands.push(
      <path key={`st${i}`}
        d={`M ${px} ${py} l ${dx * 0.3} ${dy}`}
        stroke={color} strokeWidth="0.7" strokeLinecap="round" opacity={0.7 + rng() * 0.25} />
    );
  }
  return <g key="strands">{strands}</g>;
}

// ── Scar ─────────────────────────────────────────────────

export function renderScar(
  config: PortraitConfig, rng: () => number,
  cx: number, eyeY: number, eyeSpacing: number,
): React.ReactNode {
  const side = rng() > 0.5 ? 1 : -1;
  // Scar color varies: older scars silver-pink, fresh scars redder.
  const fresh = rng() > 0.6;
  const scarStroke = fresh ? 'rgba(170,90,80,0.55)' : 'rgba(190,155,140,0.5)';
  const scarHighlight = fresh ? 'rgba(230,190,180,0.4)' : 'rgba(235,220,210,0.35)';
  // Gunners have a higher chance of powder burns (small black specks).
  const variantRoll = rng();
  const isGunner = config.role === 'Gunner';
  let variant: 'jaw' | 'brow' | 'cheek' | 'lip' | 'browThrough' | 'powder';
  if (isGunner && variantRoll > 0.75) variant = 'powder';
  else if (variantRoll > 0.82) variant = 'browThrough';
  else if (variantRoll > 0.62) variant = 'cheek';
  else if (variantRoll > 0.45) variant = 'lip';
  else if (variantRoll > 0.22) variant = 'brow';
  else variant = 'jaw';

  switch (variant) {
    case 'jaw': {
      // Original long slash running from cheek to jaw
      const sx = cx + side * (eyeSpacing + 5);
      const length = 9 + rng() * 5;
      return (
        <g key="scar">
          <path d={`M ${sx} ${eyeY + 6} l ${side * 7} ${length}`}
            stroke={scarStroke} strokeWidth="1.3" fill="none" strokeLinecap="round" />
          <path d={`M ${sx + side * 0.6} ${eyeY + 6.4} l ${side * 6.4} ${length - 0.8}`}
            stroke={scarHighlight} strokeWidth="0.5" fill="none" strokeLinecap="round" />
        </g>
      );
    }
    case 'brow': {
      // Short vertical nick through the outer brow end
      const sx = cx + side * (eyeSpacing + rng() * 3);
      return (
        <path key="scar" d={`M ${sx - 3} ${eyeY - 9} l ${1 + rng() * 2} ${8 + rng() * 3}`}
          stroke={scarStroke} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      );
    }
    case 'cheek': {
      // Diagonal across the cheekbone — classic blade-fight wound
      const sx = cx + side * (eyeSpacing + 3);
      const sy = eyeY + 10 + rng() * 4;
      const len = 10 + rng() * 6;
      return (
        <g key="scar">
          <path d={`M ${sx} ${sy} l ${side * len * 0.8} ${len * 0.5}`}
            stroke={scarStroke} strokeWidth="1.2" fill="none" strokeLinecap="round" />
          <path d={`M ${sx + side * 0.4} ${sy + 0.6} l ${side * (len * 0.8 - 0.8)} ${len * 0.5 - 0.6}`}
            stroke={scarHighlight} strokeWidth="0.45" fill="none" strokeLinecap="round" />
        </g>
      );
    }
    case 'lip': {
      // Vertical scar through the upper lip — the mouth-corner hook
      const sx = cx + side * (5 + rng() * 3);
      const sy = eyeY + 28 + rng() * 4;
      return (
        <path key="scar" d={`M ${sx} ${sy} l ${side * 0.6} ${6 + rng() * 2}`}
          stroke={scarStroke} strokeWidth="1.1" fill="none" strokeLinecap="round" />
      );
    }
    case 'browThrough': {
      // Cut straight through the brow — the iconic "split brow"
      const sx = cx + side * (eyeSpacing + 1);
      return (
        <g key="scar">
          <path d={`M ${sx - 3} ${eyeY - 13} l ${2 + rng() * 1.5} ${10 + rng() * 3}`}
            stroke={scarStroke} strokeWidth="1.6" fill="none" strokeLinecap="round" />
          {/* Small break in the brow line itself — rendered as a skin-tone gap */}
          <circle cx={sx - 1.5} cy={eyeY - 8} r={0.9} fill="rgba(235,215,195,0.7)" />
        </g>
      );
    }
    case 'powder': {
      // Powder burn / pitting — scattered dark specks on one cheek, gunner-specific
      const specks: React.ReactNode[] = [];
      const count = 5 + Math.floor(rng() * 6);
      const ox = cx + side * (eyeSpacing + 4);
      const oy = eyeY + 4;
      for (let i = 0; i < count; i++) {
        const dx = (rng() - 0.3) * 12 * side;
        const dy = rng() * 16 - 2;
        specks.push(
          <circle key={`pw${i}`} cx={ox + dx} cy={oy + dy}
            r={0.4 + rng() * 0.7} fill="rgba(30,20,15,0.55)" />
        );
      }
      return <g key="scar">{specks}</g>;
    }
  }
}

// ── Earring ──────────────────────────────────────────────

export function renderEarring(
  rng: () => number, cx: number, eyeY: number, headWidth: number,
): React.ReactNode {
  const side = rng() > 0.5 ? 1 : -1;
  const ex = cx + side * (headWidth - 0.5);
  const ey = eyeY + 12;
  const isGold = rng() > 0.4;
  const color = isGold ? '#d4a020' : '#c0c0c0';
  return (
    <g key="earring">
      <circle cx={ex} cy={ey} r={1.5} fill="rgba(80,45,25,0.28)" />
      <path d={`M ${ex} ${ey + 1} l 0 1.5`} stroke={color} strokeWidth="0.8" strokeLinecap="round" />
      <circle cx={ex} cy={ey + 4} r={2.8} fill="none" stroke={color} strokeWidth="1.3" />
      {rng() > 0.5 && <circle cx={ex} cy={ey + 8} r={1.1} fill={color} />}
    </g>
  );
}

// ── Back hair ────────────────────────────────────────────

export function renderBackHair(
  config: PortraitConfig, rng: () => number,
  cx: number, headTop: number, hw: number, eyeY: number, chinY: number, hairColor: string,
): React.ReactNode {
  const hairShadow = shiftHex(hairColor, -0.28);
  const hairHighlight = shiftHex(hairColor, 0.18);
  if (config.gender === 'Female') {
    // Hair tucked behind the ears, ending around the upper neck — never extends
    // past the chin (which created a "hood with ear flaps" silhouette in head-crop view).
    // Most 1612 European women wore hair gathered up under a coif/hood anyway.
    const styleRoll = rng();
    if (styleRoll > 0.5) {
      // Gathered/bun — minimal back hair visible
      return (
        <g key="back-hair">
          <path d={`M ${cx - hw - 2} ${headTop + 18}
              C ${cx - hw - 6} ${headTop + 45}, ${cx - hw - 3} ${headTop + 70}, ${cx - hw + 4} ${headTop + 78}
              L ${cx + hw - 4} ${headTop + 78}
              C ${cx + hw + 3} ${headTop + 70}, ${cx + hw + 6} ${headTop + 45}, ${cx + hw + 2} ${headTop + 18} Z`}
            fill={hairColor} />
          <path d={`M ${cx - hw + 2} ${headTop + 24} Q ${cx - hw + 1} ${headTop + 52}, ${cx - hw + 7} ${headTop + 74}`}
            stroke={hairShadow} strokeWidth="1.7" fill="none" opacity={0.45} strokeLinecap="round" />
          <path d={`M ${cx + hw - 2} ${headTop + 24} Q ${cx + hw - 1} ${headTop + 52}, ${cx + hw - 7} ${headTop + 74}`}
            stroke={hairShadow} strokeWidth="1.7" fill="none" opacity={0.45} strokeLinecap="round" />
          {hairTexture(cx, headTop + 6, hw * 0.82, hairShadow, hairHighlight)}
          {/* Bun at the back */}
          <ellipse cx={cx} cy={headTop + 22} rx={hw * 0.6} ry={10} fill={hairColor} opacity={0.92} />
          <path d={`M ${cx - hw * 0.35} ${headTop + 18} Q ${cx} ${headTop + 13}, ${cx + hw * 0.35} ${headTop + 18}`}
            stroke={hairHighlight} strokeWidth="0.7" fill="none" opacity={0.35} />
        </g>
      );
    }
    // Loose shoulder-length — stops at the jaw, doesn't drape past
    return (
      <path key="back-hair"
        d={`M ${cx - hw - 4} ${headTop + 18}
            C ${cx - hw - 8} ${headTop + 50}, ${cx - hw - 6} ${headTop + 80}, ${cx - hw + 2} ${headTop + 92}
            L ${cx + hw - 2} ${headTop + 92}
            C ${cx + hw + 6} ${headTop + 80}, ${cx + hw + 8} ${headTop + 50}, ${cx + hw + 4} ${headTop + 18} Z`}
        fill={hairColor} />
    );
  }
  if ((config.culturalGroup === 'EastAsian' || config.culturalGroup === 'SoutheastAsian') && rng() > 0.6) {
    return (
      <g key="back-hair">
        <path
          d={`M ${cx - hw - 2} ${headTop + 20}
            C ${cx - hw - 8} ${headTop + 60}, ${cx - hw - 6} ${headTop + 100}, ${cx - hw + 2} ${headTop + 115}
            L ${cx + hw - 2} ${headTop + 115}
            C ${cx + hw + 6} ${headTop + 100}, ${cx + hw + 8} ${headTop + 60}, ${cx + hw + 2} ${headTop + 20} Z`}
          fill={hairColor} />
        {hairTexture(cx, headTop + 14, hw * 0.9, hairShadow, hairHighlight)}
        <path d={`M ${cx - hw - 1} ${headTop + 28} Q ${cx - hw - 4} ${eyeY + 20}, ${cx - hw + 1} ${chinY + 8}`}
          stroke={hairShadow} strokeWidth="1.9" fill="none" opacity={0.38} strokeLinecap="round" />
        <path d={`M ${cx + hw + 1} ${headTop + 28} Q ${cx + hw + 4} ${eyeY + 20}, ${cx + hw - 1} ${chinY + 8}`}
          stroke={hairShadow} strokeWidth="1.9" fill="none" opacity={0.38} strokeLinecap="round" />
        <path d={`M ${cx - hw + 6} ${headTop + 24} Q ${cx - hw + 2} ${eyeY - 6}, ${cx - hw + 4} ${eyeY + 18}`}
          stroke={hairHighlight} strokeWidth="1.2" fill="none" opacity={0.18} strokeLinecap="round" />
      </g>
    );
  }
  // ── European / generic male side hair ──
  // In 1612 most European men wore hair at least collar-length. A wavy strip down the temples
  // and sides flows past the jaw — this is what peeks out below a hat brim and past the ears.
  // Cultural groups with their own distinctive styles are excluded.
  const excludedGroups = ['ArabPersian', 'Indian', 'EastAsian', 'SoutheastAsian', 'Swahili'];
  if (config.gender === 'Male' && !excludedGroups.includes(config.culturalGroup)) {
    const age = ['20s', '30s', '40s', '50s', '60s'].indexOf(config.age);
    const baldness = getBaldnessPattern(config);
    // Fully bald — only a whisper of hair at the nape/temples.
    if (baldness === 'bald') {
      // Two small tufts behind the ears.
      const tuftL = `M ${cx - hw + 2} ${eyeY + 6}
          C ${cx - hw - 3} ${eyeY + 14}, ${cx - hw - 2} ${eyeY + 22}, ${cx - hw + 4} ${eyeY + 20}
          C ${cx - hw + 2} ${eyeY + 14}, ${cx - hw + 3} ${eyeY + 8}, ${cx - hw + 2} ${eyeY + 6} Z`;
      const tuftR = `M ${cx + hw - 2} ${eyeY + 6}
          C ${cx + hw + 3} ${eyeY + 14}, ${cx + hw + 2} ${eyeY + 22}, ${cx + hw - 4} ${eyeY + 20}
          C ${cx + hw - 2} ${eyeY + 14}, ${cx + hw - 3} ${eyeY + 8}, ${cx + hw - 2} ${eyeY + 6} Z`;
      return (
        <g key="back-hair">
          <path d={tuftL} fill={hairColor} opacity={0.9} />
          <path d={tuftR} fill={hairColor} opacity={0.9} />
        </g>
      );
    }
    // Balding (monk's fringe) — crown bare, but full side/back hair remains; force short.
    const short = baldness === 'balding' ? true : (age >= 3 && rng() > 0.45);
    const long = !short && baldness !== 'balding' && rng() > 0.5;
    const flare = 5 + rng() * 3;                                 // extends well past the cheek line
    const bottomY = long ? chinY + 14 : short ? eyeY + 12 : eyeY + (chinY - eyeY) * 0.55;
    const wave = (rng() - 0.5) * 2;

    // One closed shape per side. The inner edge hugs the head; the outer edge swings out
    // past the cheek (flare) so the hair reads through the brim/face overlay.
    const leftPath = `M ${cx - hw + 1} ${headTop + 4}
        C ${cx - hw - flare} ${eyeY - 18}, ${cx - hw - flare + wave} ${eyeY + 2}, ${cx - hw - flare * 0.6} ${bottomY - 4}
        L ${cx - hw + 4} ${bottomY}
        C ${cx - hw - 1} ${eyeY + 6}, ${cx - hw + 1} ${eyeY - 14}, ${cx - hw + 1} ${headTop + 4} Z`;
    const rightPath = `M ${cx + hw - 1} ${headTop + 4}
        C ${cx + hw + flare} ${eyeY - 18}, ${cx + hw + flare - wave} ${eyeY + 2}, ${cx + hw + flare * 0.6} ${bottomY - 4}
        L ${cx + hw - 4} ${bottomY}
        C ${cx + hw + 1} ${eyeY + 6}, ${cx + hw - 1} ${eyeY - 14}, ${cx + hw - 1} ${headTop + 4} Z`;

    return (
      <g key="back-hair">
        <path d={leftPath} fill={hairColor} />
        <path d={rightPath} fill={hairColor} />
        {hairTexture(cx, headTop + 4, hw * 0.95, hairShadow, hairHighlight)}
        {/* Strand accents along the outer edge — keeps it from looking like a solid helmet */}
        <path d={`M ${cx - hw - flare * 0.9} ${eyeY - 10} Q ${cx - hw - flare} ${eyeY + 4} ${cx - hw - flare * 0.5} ${bottomY - 6}`}
          stroke={hairShadow} strokeWidth="1.6" fill="none" opacity={0.45} strokeLinecap="round" />
        <path d={`M ${cx + hw + flare * 0.9} ${eyeY - 10} Q ${cx + hw + flare} ${eyeY + 4} ${cx + hw + flare * 0.5} ${bottomY - 6}`}
          stroke={hairShadow} strokeWidth="1.6" fill="none" opacity={0.45} strokeLinecap="round" />
        <path d={`M ${cx - hw + 2} ${eyeY - 8} Q ${cx - hw - 1} ${eyeY + 5}, ${cx - hw + 1} ${bottomY - 2}`}
          stroke={hairHighlight} strokeWidth="1" fill="none" opacity={0.18} strokeLinecap="round" />
        <path d={`M ${cx + hw - 2} ${eyeY - 8} Q ${cx + hw + 1} ${eyeY + 5}, ${cx + hw - 1} ${bottomY - 2}`}
          stroke={hairHighlight} strokeWidth="1" fill="none" opacity={0.18} strokeLinecap="round" />
      </g>
    );
  }
  return null;
}

// ── Front hair ───────────────────────────────────────────

// Deterministic baldness pattern for European men — derived from seed so it's stable
// without consuming the shared RNG stream.
type Baldness = 'none' | 'receding' | 'balding' | 'bald';
function getBaldnessPattern(config: PortraitConfig): Baldness {
  if (config.gender !== 'Male') return 'none';
  if (config.culturalGroup !== 'NorthEuropean' && config.culturalGroup !== 'SouthEuropean') return 'none';
  const age = ['20s', '30s', '40s', '50s', '60s'].indexOf(config.age);
  if (age < 1) return 'none';
  // Stable 0..1 roll, independent of the main rng stream.
  const roll = ((Math.abs(config.seed) >> 11) & 0xFFFF) / 65535;
  if (age === 1) {                // 30s — a few receding, no balding
    if (roll < 0.15) return 'receding';
    return 'none';
  }
  if (age === 2) {                // 40s
    if (roll < 0.30) return 'receding';
    if (roll < 0.40) return 'balding';
    return 'none';
  }
  if (age === 3) {                // 50s
    if (roll < 0.25) return 'receding';
    if (roll < 0.55) return 'balding';
    if (roll < 0.65) return 'bald';
    return 'none';
  }
  // 60s
  if (roll < 0.20) return 'receding';
  if (roll < 0.55) return 'balding';
  if (roll < 0.80) return 'bald';
  return 'none';
}

export function renderFrontHair(
  config: PortraitConfig, rng: () => number,
  cx: number, headTop: number, hw: number, eyeY: number,
  foreheadH: number, hairColor: string,
): React.ReactNode {
  if (willHaveFullHeadwear(config, rng)) return null;
  const hairShadow = shiftHex(hairColor, -0.28);
  const hairHighlight = shiftHex(hairColor, 0.18);
  const age = ['20s', '30s', '40s', '50s', '60s'].indexOf(config.age);
  const baldness = getBaldnessPattern(config);
  // Fully bald / monk's fringe — no front hair at all. Sides render from renderBackHair.
  if (baldness === 'bald' || baldness === 'balding') return null;
  if (baldness === 'receding') {
    // M-pattern: temples pulled back, a modest central forelock/widow's peak between.
    const severity = age <= 1 ? 0.55 : age === 2 ? 0.85 : 1;
    const templeRecess = 8 + severity * 6;          // vertical pull-back at temples
    const templePullIn = hw * (0.55 - severity * 0.1);  // horizontal position of the temple indent
    const peakY = headTop + 2 + severity * 2;       // central forelock top
    const templeY = headTop + templeRecess;
    // Subtle widow's-peak dip in the middle (reads as a V rather than flat)
    const widowDip = 1.5 + severity * 1.5;
    return (
      <g key="front-hair">
        <path
          d={`M ${cx - hw - 2} ${eyeY - 12}
            C ${cx - hw - 2} ${headTop + 4}, ${cx - templePullIn - 4} ${templeY - 2}, ${cx - templePullIn} ${templeY}
            C ${cx - templePullIn + 2} ${peakY + 4}, ${cx - 4} ${peakY + widowDip}, ${cx} ${peakY + widowDip + 0.5}
            C ${cx + 4} ${peakY + widowDip}, ${cx + templePullIn - 2} ${peakY + 4}, ${cx + templePullIn} ${templeY}
            C ${cx + templePullIn + 4} ${templeY - 2}, ${cx + hw + 2} ${headTop + 4}, ${cx + hw + 2} ${eyeY - 12}
            C ${cx + hw + 4} ${headTop + 2}, ${cx + hw * 0.5} ${headTop - 4}, ${cx} ${headTop - 4}
            C ${cx - hw * 0.5} ${headTop - 4}, ${cx - hw - 4} ${headTop + 2}, ${cx - hw - 2} ${eyeY - 12} Z`}
          fill={hairColor} />
        {hairTexture(cx, headTop + 1, hw * 0.85, hairShadow, hairHighlight)}
        <path d={`M ${cx - templePullIn + 1} ${templeY} Q ${cx} ${peakY + 2}, ${cx + templePullIn - 1} ${templeY}`}
          stroke={hairHighlight} strokeWidth="1.2" fill="none" opacity={0.2} strokeLinecap="round" />
        <path d={`M ${cx - hw + 2} ${headTop + 8} Q ${cx - hw * 0.7} ${headTop + 16}, ${cx - hw + 3} ${eyeY - 12}`}
          stroke={hairShadow} strokeWidth="1.5" fill="none" opacity={0.35} strokeLinecap="round" />
        <path d={`M ${cx + hw - 2} ${headTop + 8} Q ${cx + hw * 0.7} ${headTop + 16}, ${cx + hw - 3} ${eyeY - 12}`}
          stroke={hairShadow} strokeWidth="1.5" fill="none" opacity={0.35} strokeLinecap="round" />
      </g>
    );
  }

  // Swahili short textured hair
  if (config.culturalGroup === 'Swahili' && config.gender === 'Male') {
    const dots: React.ReactNode[] = [];
    for (let i = 0; i < 40; i++) {
      const angle = rng() * Math.PI * 2;
      const dist = rng() * (hw - 4);
      const hx = cx + Math.cos(angle) * dist * 0.9;
      const hy = headTop + 6 + Math.sin(angle) * dist * 0.35;
      if (hy < eyeY - 8) {
        dots.push(<circle key={`hd-${i}`} cx={hx} cy={hy} r={1.2 + rng() * 0.8} fill={hairColor} opacity={0.7 + rng() * 0.3} />);
      }
    }
    // Base cap shape
    return (
      <g key="front-hair">
        <path
          d={`M ${cx - hw - 2} ${eyeY - 10}
              C ${cx - hw - 2} ${headTop + 2}, ${cx} ${headTop - 4}, ${cx} ${headTop - 3}
              C ${cx} ${headTop - 4}, ${cx + hw + 2} ${headTop + 2}, ${cx + hw + 2} ${eyeY - 10}
              C ${cx + hw + 3} ${headTop + 1}, ${cx} ${headTop - 5}, ${cx} ${headTop - 5}
              C ${cx} ${headTop - 5}, ${cx - hw - 3} ${headTop + 1}, ${cx - hw - 2} ${eyeY - 10} Z`}
          fill={hairColor} opacity={0.85}
        />
        {hairTexture(cx, headTop + 1, hw * 0.82, hairShadow, hairHighlight)}
        <path d={`M ${cx - hw * 0.65} ${headTop + 4} Q ${cx} ${headTop - 3}, ${cx + hw * 0.65} ${headTop + 4}`}
          stroke={hairHighlight} strokeWidth="1.1" fill="none" opacity={0.18} strokeLinecap="round" />
        {dots}
      </g>
    );
  }

  if (config.gender === 'Female') {
    // Center-parted hair, smoothed back over the crown — typical 1612 European style
    // (hair would normally be gathered under a coif/hood, drawn separately in renderHeadwear).
    const partSide = rng() > 0.5 ? -1 : 1;
    const partOffset = partSide * 2;
    return (
      <g key="front-hair">
        {/* Crown sweep — covers the top of the head, parted slightly off-center */}
        <path
          d={`M ${cx - hw - 2} ${eyeY - 8}
              C ${cx - hw - 3} ${headTop + 4}, ${cx - hw * 0.4} ${headTop - 2}, ${cx + partOffset} ${headTop - 1}
              C ${cx + hw * 0.4} ${headTop - 2}, ${cx + hw + 3} ${headTop + 4}, ${cx + hw + 2} ${eyeY - 8}
              C ${cx + hw - 4} ${headTop + foreheadH * 0.6}, ${cx + 6} ${headTop + foreheadH * 0.4}, ${cx + partOffset} ${headTop + foreheadH * 0.3}
              C ${cx - 6} ${headTop + foreheadH * 0.4}, ${cx - hw + 4} ${headTop + foreheadH * 0.6}, ${cx - hw - 2} ${eyeY - 8} Z`}
          fill={hairColor} />
        {hairTexture(cx, headTop + 2, hw * 0.82, hairShadow, hairHighlight)}
        {/* Subtle part line — slight darker shadow along the parting */}
        <path d={`M ${cx + partOffset} ${headTop} L ${cx + partOffset + partSide * 1} ${headTop + foreheadH * 0.3}`}
          stroke="rgba(0,0,0,0.18)" strokeWidth="1" fill="none" strokeLinecap="round" />
      </g>
    );
  }

  if (config.culturalGroup === 'EastAsian' && rng() > 0.4) {
    return (
      <g key="front-hair">
        <path
          d={`M ${cx - hw + 8} ${headTop + 12}
            C ${cx - hw + 2} ${headTop}, ${cx} ${headTop - 6}, ${cx + hw - 2} ${headTop}
            L ${cx + hw - 8} ${headTop + 12}
            C ${cx + hw - 12} ${headTop + 4}, ${cx - hw + 12} ${headTop + 4}, ${cx - hw + 8} ${headTop + 12} Z`}
          fill={hairColor} />
        {hairTexture(cx, headTop + 2, hw * 0.72, hairShadow, hairHighlight)}
        <path d={`M ${cx - hw + 11} ${headTop + 11} Q ${cx} ${headTop + 3}, ${cx + hw - 11} ${headTop + 11}`}
          stroke={hairHighlight} strokeWidth="1.1" fill="none" opacity={0.16} strokeLinecap="round" />
        <path d={`M ${cx - hw + 7} ${headTop + 11} l -2 5 M ${cx + hw - 7} ${headTop + 11} l 2 5`}
          stroke={hairShadow} strokeWidth="1.5" fill="none" opacity={0.35} strokeLinecap="round" />
      </g>
    );
  }

  if (age >= 3) {
    const recede = (age - 2) * 4;
    return (
      <g key="front-hair">
        <path
          d={`M ${cx - hw - 2} ${eyeY - 12}
            C ${cx - hw - 2} ${headTop + 6}, ${cx - hw * 0.3} ${headTop - 2 + recede}, ${cx} ${headTop + recede * 0.5}
            C ${cx + hw * 0.3} ${headTop - 2 + recede}, ${cx + hw + 2} ${headTop + 6}, ${cx + hw + 2} ${eyeY - 12}
            C ${cx + hw + 4} ${headTop + 4}, ${cx + hw * 0.5} ${headTop - 4}, ${cx} ${headTop - 4}
            C ${cx - hw * 0.5} ${headTop - 4}, ${cx - hw - 4} ${headTop + 4}, ${cx - hw - 2} ${eyeY - 12} Z`}
          fill={hairColor} />
        {hairTexture(cx, headTop + 1, hw * 0.84, hairShadow, hairHighlight)}
        <path d={`M ${cx - hw * 0.5} ${headTop + 5} Q ${cx} ${headTop - 2 + recede * 0.4}, ${cx + hw * 0.5} ${headTop + 5}`}
          stroke={hairHighlight} strokeWidth="1.1" fill="none" opacity={0.18} strokeLinecap="round" />
      </g>
    );
  }

  const waviness = rng() * 4;
  return (
    <g key="front-hair">
      <path
        d={`M ${cx - hw - 3} ${eyeY - 10}
          C ${cx - hw - 3} ${headTop + 4}, ${cx - hw * 0.3} ${headTop - 4 + waviness}, ${cx} ${headTop - 2}
          C ${cx + hw * 0.3} ${headTop - 4 - waviness}, ${cx + hw + 3} ${headTop + 4}, ${cx + hw + 3} ${eyeY - 10}
          C ${cx + hw + 5} ${headTop + 2}, ${cx + hw * 0.5} ${headTop - 6}, ${cx} ${headTop - 6}
          C ${cx - hw * 0.5} ${headTop - 6}, ${cx - hw - 5} ${headTop + 2}, ${cx - hw - 3} ${eyeY - 10} Z`}
        fill={hairColor} />
      {hairTexture(cx, headTop + 1, hw * 0.9, hairShadow, hairHighlight)}
      <path d={`M ${cx - hw * 0.62} ${headTop + 5} Q ${cx} ${headTop - 4}, ${cx + hw * 0.62} ${headTop + 5}`}
        stroke={hairHighlight} strokeWidth="1.1" fill="none" opacity={0.18} strokeLinecap="round" />
      <path d={`M ${cx - hw + 1} ${headTop + 8} Q ${cx - hw * 0.82} ${headTop + 18}, ${cx - hw + 2} ${eyeY - 12}`}
        stroke={hairShadow} strokeWidth="1.4" fill="none" opacity={0.34} strokeLinecap="round" />
      <path d={`M ${cx + hw - 1} ${headTop + 8} Q ${cx + hw * 0.82} ${headTop + 18}, ${cx + hw - 2} ${eyeY - 12}`}
        stroke={hairShadow} strokeWidth="1.4" fill="none" opacity={0.34} strokeLinecap="round" />
    </g>
  );
}

// ── Headwear ─────────────────────────────────────────────

function willHaveFullHeadwear(config: PortraitConfig, _rng: () => number): boolean {
  if (config.culturalGroup === 'ArabPersian' && config.gender === 'Male') return true;
  if (config.culturalGroup === 'Indian' && config.gender === 'Male') return true;
  return false;
}

export function renderHeadwear(
  config: PortraitConfig, rng: () => number,
  cx: number, headTop: number, hw: number, eyeY: number,
  _foreheadH: number, hairColor: string,
): React.ReactNode {
  const { culturalGroup, socialClass, gender, nationality } = config;

  if ((culturalGroup === 'ArabPersian' || culturalGroup === 'Indian') && gender === 'Male') {
    const turbanColor = socialClass === 'Noble'
      ? (nationality === 'Ottoman' ? '#f0f0f0' : nationality === 'Persian' ? '#3a6a8a' : '#c42020')
      : rng() > 0.5 ? '#d4c4b0' : '#b8a890';
    const turbanH = 22 + rng() * 10;
    return (
      <g key="turban">
        <path d={`M ${cx - hw - 6} ${headTop + 8}
            C ${cx - hw - 8} ${headTop - turbanH}, ${cx + hw + 8} ${headTop - turbanH}, ${cx + hw + 6} ${headTop + 8}
            C ${cx + hw + 2} ${headTop + 14}, ${cx - hw - 2} ${headTop + 14}, ${cx - hw - 6} ${headTop + 8} Z`}
          fill={turbanColor} />
        <path d={`M ${cx - hw - 3} ${headTop + 6} Q ${cx} ${headTop - turbanH + 8} ${cx + hw + 3} ${headTop + 4}`}
          stroke="rgba(0,0,0,0.15)" strokeWidth="2.5" fill="none" />
        <path d={`M ${cx - hw} ${headTop} Q ${cx} ${headTop - turbanH + 14} ${cx + hw} ${headTop - 2}`}
          stroke="rgba(0,0,0,0.12)" strokeWidth="2.5" fill="none" />
        <path d={`M ${cx - hw + 4} ${headTop - 6} Q ${cx} ${headTop - turbanH + 20} ${cx + hw - 4} ${headTop - 8}`}
          stroke="rgba(0,0,0,0.1)" strokeWidth="2" fill="none" />
        {socialClass === 'Noble' && (
          <g>
            <circle cx={cx} cy={headTop - 2} r={3.5} fill="#ffd700" />
            <circle cx={cx} cy={headTop - 2} r={1.8} fill={rng() > 0.5 ? '#e02020' : '#2060e0'} />
          </g>
        )}
      </g>
    );
  }

  if (culturalGroup === 'SoutheastAsian' && gender === 'Male' && rng() > 0.4) {
    const kopColor = rng() > 0.5 ? '#1a1a1a' : '#4a2020';
    return (
      <g key="kopiah">
        <path d={`M ${cx - hw + 4} ${headTop + 4} L ${cx - hw + 2} ${headTop - 12}
            C ${cx - hw + 2} ${headTop - 18}, ${cx + hw - 2} ${headTop - 18}, ${cx + hw - 2} ${headTop - 12}
            L ${cx + hw - 4} ${headTop + 4} Z`}
          fill={kopColor} />
        <path d={`M ${cx - hw + 2} ${headTop + 4} L ${cx + hw - 2} ${headTop + 4}`}
          stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
      </g>
    );
  }

  if (culturalGroup === 'EastAsian' && gender === 'Male' && rng() > 0.3) {
    return (
      <g key="topknot">
        <ellipse cx={cx} cy={headTop - 4} rx={7} ry={5} fill={hairColor} />
        <path d={`M ${cx - 3} ${headTop - 2} L ${cx} ${headTop - 14} L ${cx + 3} ${headTop - 2}`} fill={hairColor} />
      </g>
    );
  }

  // ── European male hats ──
  // Hats signified rank in 1612. Captains, merchants, and gentlemen were rarely bareheaded;
  // common sailors and labourers usually were — a broad felt hat aboard ship was an officer's mark.
  const isEurMale = (culturalGroup === 'NorthEuropean' || culturalGroup === 'SouthEuropean') && gender === 'Male';
  if (isEurMale) {
    const ageIdx = ['20s', '30s', '40s', '50s', '60s'].indexOf(config.age);
    let hatProb: number;
    if (config.role === 'Captain') hatProb = 0.90;
    else if (socialClass === 'Noble') hatProb = 0.85;
    else if (socialClass === 'Merchant') hatProb = 0.70;
    else if (config.isSailor) hatProb = 0.18;           // most common sailors: bareheaded
    else hatProb = 0.30;                                 // other working-class: usually bareheaded
    if (ageIdx >= 3 && (socialClass === 'Noble' || socialClass === 'Merchant' || config.role === 'Captain')) {
      hatProb = Math.min(0.95, hatProb + 0.08);
    }

    if (rng() < hatProb) {
      const r = rng();
      // Captains, nobles, factors → wide-brim cavalier or capotain
      if (config.role === 'Captain' || socialClass === 'Noble' || socialClass === 'Merchant') {
        if (r < 0.6) {
          return renderWideBrimHat(cx, headTop, hw, eyeY, rng, socialClass);
        } else if (r < 0.88) {
          return renderCapotain(cx, headTop, hw, eyeY, rng, socialClass);
        } else {
          return renderCoif(cx, headTop, hw, eyeY, rng);
        }
      }
      // Sailors / working class → occasional knit cap only; otherwise just the hair shows.
      return renderMonmouthCap(cx, headTop, hw, eyeY, rng);
    }
  }

  // ── European female headcoverings — c. 1612, virtually all women wore something on the head ──
  const isEurFemale = (culturalGroup === 'NorthEuropean' || culturalGroup === 'SouthEuropean') && gender === 'Female';
  if (isEurFemale) {
    if (socialClass === 'Noble') {
      // French hood — black velvet semi-circle worn back from the forehead, with a billiment band
      const veil = '#0e0c10';
      return (
        <g key="french-hood">
          {/* Veil falling behind the head */}
          <path d={`M ${cx - hw - 3} ${headTop + 14}
              C ${cx - hw - 8} ${headTop + 36}, ${cx - hw - 7} ${headTop + 68}, ${cx - hw + 2} ${headTop + 82}
              L ${cx + hw - 2} ${headTop + 82}
              C ${cx + hw + 7} ${headTop + 68}, ${cx + hw + 8} ${headTop + 36}, ${cx + hw + 3} ${headTop + 14} Z`}
            fill={veil} />
          {/* Hood front arc — sits back from the forehead showing front hair */}
          <path d={`M ${cx - hw - 3} ${headTop + 18}
              C ${cx - hw - 1} ${headTop + 2}, ${cx + hw + 1} ${headTop + 2}, ${cx + hw + 3} ${headTop + 18}
              C ${cx + hw - 8} ${headTop + 24}, ${cx - hw + 8} ${headTop + 24}, ${cx - hw - 3} ${headTop + 18} Z`}
            fill={veil} />
          {/* Billiment — gold/pearl band along the hood front */}
          <path d={`M ${cx - hw - 2} ${headTop + 17} C ${cx - hw + 1} ${headTop + 5}, ${cx + hw - 1} ${headTop + 5}, ${cx + hw + 2} ${headTop + 17}`}
            stroke="#d4b060" strokeWidth="2" fill="none" />
          {/* Pearl dots along billiment */}
          {[-0.8, -0.4, 0, 0.4, 0.8].map((t, i) => {
            const px = cx + t * (hw + 2);
            const py = headTop + 17 - Math.cos(t * Math.PI / 2) * 10;
            return <circle key={`p${i}`} cx={px} cy={py} r={1.2} fill="#f8f0e0" stroke="#a89060" strokeWidth="0.3" />;
          })}
        </g>
      );
    }
    // Merchant or Working — linen coif, the universal women's cap
    const linen = socialClass === 'Merchant' ? '#f5efde' : '#ebe3d0';
    const capY = headTop + 10;
    const capBottom = headTop + 22;
    return (
      <g key="coif">
        <path d={`M ${cx - hw - 1} ${capBottom}
            C ${cx - hw - 1} ${capY - 8}, ${cx - hw * 0.45} ${headTop - 7}, ${cx} ${headTop - 8}
            C ${cx + hw * 0.45} ${headTop - 7}, ${cx + hw + 1} ${capY - 8}, ${cx + hw + 1} ${capBottom}
            C ${cx + hw * 0.58} ${capBottom - 5}, ${cx - hw * 0.58} ${capBottom - 5}, ${cx - hw - 1} ${capBottom} Z`}
          fill={linen} stroke="#bdb29a" strokeWidth="0.7" />
        <path d={`M ${cx - hw - 1} ${capBottom - 2}
            C ${cx - hw - 5} ${headTop + 28}, ${cx - hw - 5} ${eyeY - 4}, ${cx - hw + 1} ${eyeY + 4}
            C ${cx - hw + 3} ${eyeY - 5}, ${cx - hw + 3} ${headTop + 29}, ${cx - hw - 1} ${capBottom - 2} Z`}
          fill={linen} opacity={0.88} />
        <path d={`M ${cx + hw + 1} ${capBottom - 2}
            C ${cx + hw + 5} ${headTop + 28}, ${cx + hw + 5} ${eyeY - 4}, ${cx + hw - 1} ${eyeY + 4}
            C ${cx + hw - 3} ${eyeY - 5}, ${cx + hw - 3} ${headTop + 29}, ${cx + hw + 1} ${capBottom - 2} Z`}
          fill={linen} opacity={0.88} />
        {/* Center seam */}
        <path d={`M ${cx} ${headTop - 6} L ${cx} ${capBottom - 4}`} stroke="rgba(0,0,0,0.08)" strokeWidth="0.6" />
        {/* Fold following the crown, not the brow */}
        <path d={`M ${cx - hw * 0.82} ${capBottom - 2} Q ${cx} ${headTop + 5} ${cx + hw * 0.82} ${capBottom - 2}`}
          stroke="rgba(0,0,0,0.1)" strokeWidth="0.7" fill="none" />
        {socialClass === 'Merchant' && (
          <path d={`M ${cx - hw * 0.82} ${capBottom - 1} Q ${cx} ${headTop + 6} ${cx + hw * 0.82} ${capBottom - 1}`}
            stroke="#d4b070" strokeWidth="0.5" fill="none" opacity={0.5} />
        )}
      </g>
    );
  }

  return null;
}

// ── 1612 European male hats ──────────────────────────────

// Wide-brim cavalier / "slouch" felt hat — by far the most common gentleman's hat c.1610s.
// Broad flat brim, rounded crown, hat band, optional feather sweeping back.
function renderWideBrimHat(
  cx: number, headTop: number, hw: number, eyeY: number, rng: () => number, socialClass: SocialClass,
): React.ReactNode {
  const feltOptions = socialClass === 'Noble'
    ? ['#141214', '#1a1418', '#1c1410', '#221610']
    : ['#2a2018', '#3a2a20', '#1a1a1a', '#3a2818'];
  const felt = feltOptions[Math.floor(rng() * feltOptions.length)];
  // Brim rests just above the brow (cavalier hats sat low on the forehead).
  const brimY = eyeY - 22 - rng() * 3;
  const brimRx = hw + 16 + rng() * 6;
  const brimRy = 4.5 + rng() * 1.5;
  // Crown must rise above headTop to look like it sits on the skull, not inside it.
  const crownH = (brimY - headTop) + 10 + rng() * 8;
  const crownBase = brimY - 1;
  const crownTop = crownBase - crownH;
  const crownHalfWidth = hw + 2;
  const featherSide = rng() > 0.5 ? 1 : -1;
  const hasFeather = rng() > 0.3;
  const featherColor = ['#c83020', '#e0a020', '#f0e8d0', '#1a4a8a', '#80a040'][Math.floor(rng() * 5)];
  const bandColor = socialClass === 'Noble'
    ? (rng() > 0.5 ? '#c8a040' : '#7a1818')
    : '#0e0a08';

  return (
    <g key="wide-brim">
      {/* Cast shadow on forehead */}
      <ellipse cx={cx} cy={brimY + 2} rx={brimRx - 6} ry={3} fill="rgba(0,0,0,0.22)" />
      {/* Brim — single solid ellipse, broad and flat */}
      <ellipse cx={cx} cy={brimY} rx={brimRx} ry={brimRy} fill={felt} />
      {/* Brim top highlight */}
      <ellipse cx={cx} cy={brimY - brimRy * 0.5} rx={brimRx * 0.95} ry={brimRy * 0.4}
        fill="rgba(255,240,210,0.08)" />
      {/* Crown — domed felt sitting on the brim */}
      <path d={`M ${cx - crownHalfWidth} ${brimY - 1}
          C ${cx - crownHalfWidth - 2} ${crownTop + 8}, ${cx - crownHalfWidth + 4} ${crownTop}, ${cx} ${crownTop - 1}
          C ${cx + crownHalfWidth - 4} ${crownTop}, ${cx + crownHalfWidth + 2} ${crownTop + 8}, ${cx + crownHalfWidth} ${brimY - 1} Z`}
        fill={felt} />
      {/* Crown highlight on lit side */}
      <path d={`M ${cx + 4} ${crownTop + 4} Q ${cx + crownHalfWidth - 4} ${crownTop + 6} ${cx + crownHalfWidth - 2} ${brimY - 3}`}
        stroke="rgba(255,240,210,0.12)" strokeWidth="1.5" fill="none" />
      {/* Hat band — wraps the base of the crown */}
      <rect x={cx - crownHalfWidth + 1} y={brimY - 5} width={(crownHalfWidth - 1) * 2} height={3.5} fill={bandColor} />
      {socialClass === 'Noble' && (
        <rect x={cx - crownHalfWidth + 1} y={brimY - 5.5} width={(crownHalfWidth - 1) * 2} height={0.8}
          fill="#d4b060" opacity={0.6} />
      )}
      {/* Feather — sweeps from the band up and to the back */}
      {hasFeather && (() => {
        const fx = cx + featherSide * (crownHalfWidth - 4);
        const fy = brimY - 4;
        const tipX = cx + featherSide * (crownHalfWidth + 18);
        const tipY = crownTop - 6;
        return (
          <g key="feather">
            {/* Quill */}
            <path d={`M ${fx} ${fy} Q ${cx + featherSide * (crownHalfWidth + 4)} ${crownTop - 2} ${tipX} ${tipY}`}
              stroke={featherColor} strokeWidth="3.5" fill="none" strokeLinecap="round" />
            {/* Vane shading */}
            <path d={`M ${fx + featherSide * 2} ${fy - 1} Q ${cx + featherSide * (crownHalfWidth + 6)} ${crownTop - 4} ${tipX + featherSide * 2} ${tipY - 1}`}
              stroke={featherColor} strokeWidth="2" fill="none" strokeLinecap="round" opacity={0.7} />
            {/* Tip wisps */}
            {[0, 1, 2].map(i => (
              <path key={`vw${i}`}
                d={`M ${tipX - featherSide * i * 3} ${tipY + i * 2} l ${featherSide * 4} -2`}
                stroke={featherColor} strokeWidth="0.9" opacity={0.5} />
            ))}
          </g>
        );
      })()}
    </g>
  );
}

// Capotain — the iconic "Puritan" steeple-crowned hat, also worn widely by merchants and
// gentlemen across Protestant Europe c.1590-1640. Stiff felt, narrow flat brim, tall tapered crown.
function renderCapotain(
  cx: number, headTop: number, hw: number, eyeY: number, rng: () => number, socialClass: SocialClass,
): React.ReactNode {
  const felt = socialClass === 'Noble' ? '#0e0e10' : (rng() > 0.5 ? '#1a1410' : '#241810');
  // Brim rests on the brow. Capotain brims were narrow and flat.
  const brimY = eyeY - 20 - rng() * 3;
  const brimW = hw + 6 + rng() * 4;
  // Crown rises moderately above the skull — period capotains were taller than cavalier hats
  // but not stovepipes. Cap rise above headTop at ~14–22px.
  const riseAboveSkull = 14 + rng() * 8;
  const crownH = (brimY - headTop) + riseAboveSkull;
  const taper = 3 + rng() * 2;
  const crownBase = brimY - 1;
  const crownTop = crownBase - crownH;
  const crownHalfWidth = hw + 1;
  const tilt = (rng() - 0.5) * 3;
  const hasBuckle = socialClass === 'Noble' || rng() > 0.5;

  return (
    <g key="capotain" transform={`rotate(${tilt} ${cx} ${brimY})`}>
      <ellipse cx={cx} cy={brimY + 3} rx={brimW - 2} ry={3} fill="rgba(0,0,0,0.2)" />
      {/* Brim — flat, narrow */}
      <ellipse cx={cx} cy={brimY} rx={brimW} ry={3.5} fill={felt} />
      <ellipse cx={cx} cy={brimY + 1} rx={brimW - 1} ry={1.5} fill="rgba(0,0,0,0.3)" />
      {/* Crown — tall, slightly tapered upward */}
      <path d={`M ${cx - crownHalfWidth} ${crownBase}
          L ${cx - crownHalfWidth + taper} ${crownTop + 2}
          C ${cx - crownHalfWidth + taper} ${crownTop - 2}, ${cx + crownHalfWidth - taper} ${crownTop - 2}, ${cx + crownHalfWidth - taper} ${crownTop + 2}
          L ${cx + crownHalfWidth} ${crownBase} Z`}
        fill={felt} />
      {/* Crown highlight strip */}
      <path d={`M ${cx - crownHalfWidth + 2 + taper} ${crownTop + 6} L ${cx - crownHalfWidth + 3 + taper} ${crownBase - 2}`}
        stroke="rgba(255,240,210,0.1)" strokeWidth="1.5" fill="none" />
      {/* Hat band */}
      <rect x={cx - crownHalfWidth + 1} y={brimY - 4} width={(crownHalfWidth - 1) * 2} height={3} fill="#0a0608" />
      {/* Buckle (Puritan signature) */}
      {hasBuckle && (
        <g>
          <rect x={cx - 3} y={brimY - 4.5} width={6} height={4} fill="none" stroke="#d4b060" strokeWidth="0.8" />
          <rect x={cx - 1.5} y={brimY - 3.5} width={3} height={2} fill="#d4b060" opacity={0.4} />
        </g>
      )}
    </g>
  );
}

// Coif / linen skullcap — close-fitting cap tied under the chin, common for older men,
// scholars, and indoor wear. Plain white linen.
function renderCoif(
  cx: number, headTop: number, hw: number, eyeY: number, rng: () => number,
): React.ReactNode {
  const linen = rng() > 0.5 ? '#f0ebde' : '#e6dfce';
  const capBottom = headTop + 20;
  return (
    <g key="coif">
      {/* Cap covering top and sides of head */}
      <path d={`M ${cx - hw - 1} ${capBottom}
          C ${cx - hw - 2} ${headTop - 2}, ${cx + hw + 2} ${headTop - 2}, ${cx + hw + 1} ${capBottom}
          C ${cx + hw * 0.55} ${capBottom - 5}, ${cx - hw * 0.55} ${capBottom - 5}, ${cx - hw - 1} ${capBottom} Z`}
        fill={linen} stroke="#bdb29a" strokeWidth="0.6" />
      {/* Center seam */}
      <path d={`M ${cx} ${headTop - 1} L ${cx} ${capBottom - 5}`} stroke="rgba(0,0,0,0.08)" strokeWidth="0.6" />
      {/* Subtle fold shadow */}
      <path d={`M ${cx - hw * 0.8} ${capBottom - 2} Q ${cx} ${headTop + 4} ${cx + hw * 0.8} ${capBottom - 2}`}
        stroke="rgba(0,0,0,0.06)" strokeWidth="1" fill="none" />
    </g>
  );
}

// Monmouth cap — knitted wool sailor's cap, the standard 1612 mariner's headwear.
// Round dome, rolled brim. Brown, dark blue, or russet.
function renderMonmouthCap(
  cx: number, headTop: number, hw: number, eyeY: number, rng: () => number,
): React.ReactNode {
  const palette = ['#3a2818', '#2a3a4a', '#1a2030', '#5c2a18', '#3a3828', '#4a3818'];
  const wool = palette[Math.floor(rng() * palette.length)];
  const apexLean = (rng() - 0.5) * 4;
  // Monmouth caps were close-fitting knitted wool, pulled snug over the brow.
  // Apex sits just above the skull — not a tall cap.
  const brimY = eyeY - 18 - rng() * 3;
  const apexY = headTop - 3 - rng() * 3;
  const capHalfWidth = hw + 3;

  return (
    <g key="monmouth">
      {/* Cast shadow on forehead */}
      <ellipse cx={cx} cy={brimY - 1} rx={capHalfWidth} ry={2.8} fill="rgba(0,0,0,0.22)" />
      {/* Main cap dome — sweeps from the low brim up and over the skull to the apex */}
      <path d={`M ${cx - capHalfWidth} ${brimY}
          C ${cx - capHalfWidth - 2} ${headTop + 4}, ${cx - hw + 2 + apexLean} ${apexY + 2}, ${cx + apexLean} ${apexY}
          C ${cx + hw - 2 + apexLean} ${apexY + 2}, ${cx + capHalfWidth + 2} ${headTop + 4}, ${cx + capHalfWidth} ${brimY} Z`}
        fill={wool} />
      {/* Knit texture — subtle horizontal ribbing following the dome */}
      {[1, 2, 3, 4, 5].map(i => (
        <path key={`rib-${i}`}
          d={`M ${cx - capHalfWidth + 2} ${brimY - i * 6} Q ${cx + apexLean * (i / 5)} ${brimY - 1 - i * 6} ${cx + capHalfWidth - 2} ${brimY - i * 6}`}
          stroke="rgba(0,0,0,0.16)" strokeWidth="0.4" fill="none" />
      ))}
      {/* Rolled brim — fattened band along the base */}
      <ellipse cx={cx} cy={brimY + 1} rx={capHalfWidth + 1} ry={2.8} fill={wool} />
      <ellipse cx={cx} cy={brimY + 2} rx={capHalfWidth} ry={1.6} fill="rgba(0,0,0,0.28)" />
    </g>
  );
}
