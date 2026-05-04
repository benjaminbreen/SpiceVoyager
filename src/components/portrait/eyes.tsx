import React from 'react';
import type { PortraitConfig, SkinPalette } from '../../utils/portraitConfig';

export type EyeShape = 'round' | 'almond' | 'droopy' | 'wide' | 'hooded';

export function renderEyeWithLid(
  ex: number, ey: number, ew: number, eh: number,
  slant: number, lidWeight: number, epicanthic: number,
  irisColor: string, skin: SkinPalette,
  browInner: number, browOuter: number,
  hairColor: string, config: PortraitConfig,
  underEyeBags: number,
  isLeft: boolean, uid: string,
  gazeX: number = 0, gazeY: number = 0,
  eyeShape: EyeShape = 'almond',
  blinkDuration: number = 4, blinkDelay: number = 0,
  gazeAnimation: string = '', browAnimation: string = '',
): React.ReactNode {
  const hw = ew / 2;
  const dir = isLeft ? -1 : 1;
  const key = isLeft ? 'eyeL' : 'eyeR';

  const innerX = ex - hw * dir;
  const outerX = ex + hw * dir;

  let topSpread: number, botOpen: number, topPeak: number, droopOuter: number;
  switch (eyeShape) {
    case 'round':
      topSpread = 0.45; botOpen = 0.5; topPeak = 0.5; droopOuter = 0;
      break;
    case 'almond':
      topSpread = 0.3; botOpen = 0.34; topPeak = 0.45; droopOuter = 0;
      break;
    case 'wide':
      topSpread = 0.35; botOpen = 0.38; topPeak = 0.55; droopOuter = 0;
      break;
    case 'hooded':
      topSpread = 0.3; botOpen = 0.3; topPeak = 0.4; droopOuter = 0;
      break;
    case 'droopy':
      topSpread = 0.3; botOpen = 0.36; topPeak = 0.35; droopOuter = 2;
      break;
  }
  if (epicanthic > 0.5) {
    topSpread = Math.min(topSpread, 0.32);
    botOpen *= 0.76;
    topPeak -= 0.08;
  }
  const openRoll = (((Math.abs(config.seed) >> (isLeft ? 7 : 13)) & 0xff) / 255);
  const openness = openRoll > 0.62 ? (openRoll - 0.62) / 0.38 : 0;
  botOpen += openness * (epicanthic > 0.5 ? 0.11 : 0.16);

  const effEh = eh * (1 - lidWeight * 0.5);
  const baseUpperCover = effEh * (
    epicanthic > 0.5 ? 0.28 :
    eyeShape === 'hooded' ? 0.22 :
    eyeShape === 'round' ? 0.1 : 0.15
  );
  const upperCover = Math.max(0, baseUpperCover - effEh * openness * (epicanthic > 0.5 ? 0.1 : 0.14));
  const topInnerY = ey - effEh * (1 - Math.abs(topPeak - 0.5) * 0.6) + upperCover + slant * 0.3;
  const topOuterY = ey - effEh * (1 - Math.abs(topPeak - 0.5) * 0.6) + upperCover - slant * 0.3 + droopOuter * 0.4;
  const botInnerY = ey + effEh * botOpen + slant * 0.1 - epicanthic * 0.2;
  const botOuterY = ey + effEh * botOpen - slant * 0.1 + droopOuter * 0.4;
  const innerCornerY = ey + epicanthic * 0.2;
  const outerCornerY = ey + droopOuter;
  const cp1x = innerX + hw * topSpread * 2 * dir;
  const cp2x = outerX - hw * topSpread * 2 * dir;
  const scleraPath = `M ${innerX} ${innerCornerY}
    C ${cp1x} ${topInnerY - epicanthic * 0.15}, ${cp2x} ${topOuterY}, ${outerX} ${outerCornerY}
    C ${cp2x} ${botOuterY}, ${cp1x} ${botInnerY}, ${innerX} ${innerCornerY} Z`;

  const irisR = Math.min(effEh * 0.78, hw * 0.48);
  const pupilR = irisR * 0.34;
  const irisX = ex + gazeX;
  const irisY = ey + gazeY * 0.5 + droopOuter * 0.15;
  const irisGradientId = `${key}-iris-grad-${uid}`;
  const irisGlowId = `${key}-iris-glow-${uid}`;
  const isDarkIris = config.eyeColorIndex <= 1 || config.culturalGroup === 'EastAsian';
  const irisWarmLight = isDarkIris ? '#6f5832' : '#f2dfaa';
  const irisCoreOpacity = isDarkIris ? 0.08 : 0.34;
  const irisGlowOpacity = isDarkIris ? 0.06 : 0.22;
  const irisRayOpacity = isDarkIris ? 0.1 : 0.26;
  const catchlightOpacity = isDarkIris ? 0.48 : 0.72;
  const fullTopY = ey - eh;
  const lidOpacity = eyeShape === 'hooded' ? 0.85 : 0.65;
  const lidPath = `M ${innerX} ${innerCornerY}
    C ${cp1x} ${fullTopY - epicanthic * 0.15}, ${cp2x} ${fullTopY - slant * 0.3}, ${outerX} ${outerCornerY}
    C ${cp2x} ${topOuterY + 1}, ${cp1x} ${topInnerY + 1 - epicanthic * 0.1}, ${innerX} ${innerCornerY} Z`;
  const creaseY = fullTopY - 2;
  const creasePath = `M ${innerX + dir * 2} ${creaseY + slant * 0.2 - epicanthic * 0.1}
    C ${cp1x} ${creaseY - 1}, ${cp2x} ${creaseY - slant * 0.2 + droopOuter * 0.2}, ${outerX - dir * 1} ${outerCornerY - 1.5}`;
  const upperRimPath = `M ${innerX} ${innerCornerY}
    C ${cp1x} ${topInnerY - epicanthic * 0.15}, ${cp2x} ${topOuterY + droopOuter * 0.2}, ${outerX} ${outerCornerY}`;
  const lowerRimPath = `M ${innerX + dir * 1} ${innerCornerY + 0.2}
    C ${cp1x} ${botInnerY + 0.2}, ${cp2x} ${botOuterY + 0.25}, ${outerX - dir * 1} ${outerCornerY + 0.25}`;
  const lidHighlightPath = `M ${innerX + dir * 3} ${topInnerY + 1.4}
    C ${cp1x} ${topInnerY + 2.2}, ${cp2x} ${topOuterY + 2.1}, ${outerX - dir * 3} ${topOuterY + 1.3}`;
  const browStartX = ex - hw * 0.95 * dir;
  const browMidX = ex + hw * 0.05 * dir;
  const browEndX = ex + hw * 1.15 * dir;
  const browStartY = fullTopY - 4 + browInner;
  const browMidY = fullTopY - 7 + Math.min(browInner, browOuter);
  const browEndY = fullTopY - 4 + browOuter + droopOuter * 0.3;
  const browThickness = config.gender === 'Male' ? 2.6 : 1.8;
  const browPath = `M ${browStartX} ${browStartY}
    Q ${browMidX} ${browMidY}, ${browEndX} ${browEndY}
    Q ${browMidX} ${browMidY + browThickness}, ${browStartX} ${browStartY + browThickness * 0.7} Z`;
  const lashCount = config.gender === 'Female' ? 4 : 2;
  const lashOpacity = config.gender === 'Female' ? 0.38 : 0.18;

  return (
    <g key={key}>
      <defs key={`${key}-clip-def-${uid}`}>
        <clipPath id={`${key}-clip-${uid}`}>
          <path d={scleraPath} />
        </clipPath>
        <radialGradient id={irisGradientId} cx="42%" cy="38%" r="62%">
          <stop offset="0%" stopColor={irisWarmLight} stopOpacity={irisCoreOpacity} />
          <stop offset="34%" stopColor={irisColor} />
          <stop offset="72%" stopColor={irisColor} stopOpacity={isDarkIris ? 1 : 0.88} />
          <stop offset="100%" stopColor="#090807" stopOpacity={isDarkIris ? 0.9 : 0.72} />
        </radialGradient>
        <radialGradient id={irisGlowId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={`rgba(255,238,178,${irisGlowOpacity})`} />
          <stop offset="52%" stopColor={`rgba(255,238,178,${irisGlowOpacity * 0.22})`} />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
      </defs>
      <ellipse key={`${key}-sock`} cx={ex} cy={ey + 1} rx={hw + 2} ry={effEh + 2} fill="rgba(0,0,0,0.055)" />
      <path key={`${key}-scl`} d={scleraPath} fill="#ded7c9" />
      <g key={`${key}-iris`} clipPath={`url(#${key}-clip-${uid})`}
        style={gazeAnimation ? {
          transformBox: 'fill-box' as any,
          transformOrigin: '50% 50%',
          animation: gazeAnimation,
        } : undefined}>
        <circle cx={irisX} cy={irisY} r={irisR + 0.8} fill="#1a1a1a" opacity={0.18} />
        <circle cx={irisX} cy={irisY} r={irisR} fill={`url(#${irisGradientId})`} />
        <circle cx={irisX} cy={irisY} r={irisR * 0.72} fill={`url(#${irisGlowId})`} />
        {Array.from({ length: 8 }).map((_, i) => {
          const angle = (i * 45 + (isLeft ? 8 : -8)) * Math.PI / 180;
          const x1 = irisX + Math.cos(angle) * irisR * 0.3;
          const y1 = irisY + Math.sin(angle) * irisR * 0.3;
          const x2 = irisX + Math.cos(angle) * irisR * 0.84;
          const y2 = irisY + Math.sin(angle) * irisR * 0.84;
          return (
            <line
              key={`${key}-iris-ray-${i}`}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={`rgba(255,235,180,${irisRayOpacity})`}
              strokeWidth="0.35"
              strokeLinecap="round"
            />
          );
        })}
        <circle cx={irisX} cy={irisY} r={irisR * 0.7} fill="none" stroke={`rgba(255,240,190,${isDarkIris ? 0.06 : 0.18})`} strokeWidth="0.55" />
        <circle cx={irisX} cy={irisY} r={irisR} fill="none" stroke="rgba(0,0,0,0.34)" strokeWidth={Math.max(0.75, irisR * 0.18)} />
        <circle cx={irisX} cy={irisY} r={pupilR} fill="#080808" />
        <circle cx={irisX} cy={irisY} r={pupilR * 1.45} fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth="0.7" />
        <ellipse cx={irisX + irisR * 0.24} cy={irisY - irisR * 0.24} rx={irisR * 0.18} ry={irisR * 0.15} fill={`rgba(255,246,220,${catchlightOpacity})`} />
        <circle cx={irisX - irisR * 0.18} cy={irisY + irisR * 0.2} r={irisR * 0.06} fill={`rgba(255,255,245,${isDarkIris ? 0.18 : 0.34})`} />
      </g>
      <path
        key={`${key}-blink-lid`}
        d={scleraPath}
        fill={skin.mid}
        style={{
          transformBox: 'fill-box' as any,
          transformOrigin: '50% 0%',
          animation: `blink-${uid} ${blinkDuration}s ease-in-out ${blinkDelay}s infinite`,
        }}
      />
      <path key={`${key}-lid`} d={lidPath} fill={skin.mid} opacity={lidOpacity} />
      <path key={`${key}-upper-shadow`}
        d={upperRimPath}
        stroke="rgba(0,0,0,0.28)"
        strokeWidth={config.gender === 'Female' ? 1.05 : 0.85}
        fill="none"
        strokeLinecap="round"
      />
      <path key={`${key}-lid-highlight`}
        d={lidHighlightPath}
        stroke="rgba(255,238,205,0.18)"
        strokeWidth="0.65"
        fill="none"
        strokeLinecap="round"
      />
      {eyeShape !== 'hooded' && (
        <path key={`${key}-crease`} d={creasePath}
          stroke="rgba(0,0,0,0.16)" strokeWidth="0.75" fill="none" strokeLinecap="round" />
      )}
      {eyeShape === 'hooded' && (
        <path key={`${key}-hood`}
          d={`M ${innerX + dir * 1} ${innerCornerY - 0.5}
              C ${cp1x} ${topInnerY - 0.5}, ${cp2x} ${topOuterY - 0.5 + droopOuter * 0.2}, ${outerX - dir * 1} ${outerCornerY - 0.5}`}
          stroke="rgba(0,0,0,0.18)" strokeWidth="0.9" fill="none" />
      )}
      <path key={`${key}-lash`}
        d={upperRimPath}
        stroke="rgba(0,0,0,0.36)" strokeWidth={config.gender === 'Female' ? 1.05 : 0.65} fill="none"
        strokeLinecap="round"
      />
      {Array.from({ length: lashCount }).map((_, i) => {
        const t = 0.58 + i * (0.34 / Math.max(1, lashCount - 1));
        const lx = innerX + (outerX - innerX) * t;
        const curveY = topInnerY + (topOuterY - topInnerY) * t + droopOuter * 0.15;
        const lashLen = config.gender === 'Female' ? 2.4 - i * 0.25 : 1.3;
        return (
          <line
            key={`${key}-lash-${i}`}
            x1={lx}
            y1={curveY + 0.2}
            x2={lx + dir * lashLen * 0.55}
            y2={curveY - lashLen}
            stroke="rgba(0,0,0,0.45)"
            strokeWidth={config.gender === 'Female' ? 0.55 : 0.35}
            strokeLinecap="round"
            opacity={lashOpacity}
          />
        );
      })}
      <path key={`${key}-lower`}
        d={lowerRimPath}
        stroke="rgba(0,0,0,0.16)" strokeWidth="0.55" fill="none" strokeLinecap="round"
      />
      {epicanthic > 0.5 && (
        <path key={`${key}-fold`}
          d={`M ${innerX - dir * 1} ${ey} C ${innerX + dir * 2} ${ey - epicanthic - 0.5}, ${innerX + dir * 5} ${ey - epicanthic}, ${innerX + dir * 7} ${ey - epicanthic * 0.4}`}
          stroke="rgba(0,0,0,0.12)" strokeWidth="0.8" fill="none" />
      )}
      {underEyeBags > 0 && (
        <path key={`${key}-bags`}
          d={`M ${innerX + dir * 3} ${ey + effEh * botOpen}
              C ${ex - dir * 2} ${ey + effEh * botOpen + 2.5}, ${ex + dir * 2} ${ey + effEh * botOpen + 2.5}, ${outerX - dir * 3} ${ey + effEh * botOpen}`}
          stroke="rgba(0,0,0,0.18)" strokeWidth="0.6" fill="none" opacity={underEyeBags / 0.08 * 0.3}
        />
      )}
      <path key={`${key}-brow-shadow`}
        d={`M ${browStartX} ${browStartY + browThickness + 1}
            Q ${browMidX} ${browMidY + browThickness + 2}, ${browEndX} ${browEndY + browThickness + 1}`}
        stroke="rgba(0,0,0,0.16)"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
      />
      <path key={`${key}-brow`}
        d={browPath}
        style={browAnimation ? {
          transformBox: 'fill-box' as any,
          transformOrigin: '50% 100%',
          animation: browAnimation,
        } : undefined}
        fill={hairColor}
        opacity={0.92}
      />
      <path key={`${key}-brow-strand`}
        d={`M ${browStartX + dir * 1.5} ${browStartY + 0.5}
            Q ${browMidX} ${browMidY + 0.4}, ${browEndX - dir * 1.5} ${browEndY + 0.3}`}
        stroke="rgba(255,235,190,0.16)"
        strokeWidth="0.55"
        fill="none"
        strokeLinecap="round"
      />
    </g>
  );
}
