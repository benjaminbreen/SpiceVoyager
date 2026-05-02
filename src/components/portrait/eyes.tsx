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
      topSpread = 0.45; botOpen = 0.6; topPeak = 0.5; droopOuter = 0;
      break;
    case 'almond':
      topSpread = 0.3; botOpen = 0.4; topPeak = 0.45; droopOuter = 0;
      break;
    case 'wide':
      topSpread = 0.35; botOpen = 0.45; topPeak = 0.55; droopOuter = 0;
      break;
    case 'hooded':
      topSpread = 0.3; botOpen = 0.4; topPeak = 0.4; droopOuter = 0;
      break;
    case 'droopy':
      topSpread = 0.3; botOpen = 0.45; topPeak = 0.35; droopOuter = 2;
      break;
  }

  const effEh = eh * (1 - lidWeight * 0.5);
  const topInnerY = ey - effEh * (1 - Math.abs(topPeak - 0.5) * 0.6) + slant * 0.3;
  const topOuterY = ey - effEh * (1 - Math.abs(topPeak - 0.5) * 0.6) - slant * 0.3 + droopOuter * 0.4;
  const botInnerY = ey + effEh * botOpen + slant * 0.1 - epicanthic * 0.2;
  const botOuterY = ey + effEh * botOpen - slant * 0.1 + droopOuter * 0.4;
  const innerCornerY = ey + epicanthic * 0.2;
  const outerCornerY = ey + droopOuter;
  const cp1x = innerX + hw * topSpread * 2 * dir;
  const cp2x = outerX - hw * topSpread * 2 * dir;
  const scleraPath = `M ${innerX} ${innerCornerY}
    C ${cp1x} ${topInnerY - epicanthic * 0.15}, ${cp2x} ${topOuterY}, ${outerX} ${outerCornerY}
    C ${cp2x} ${botOuterY}, ${cp1x} ${botInnerY}, ${innerX} ${innerCornerY} Z`;

  const irisR = Math.min(effEh * 0.85, hw * 0.52);
  const pupilR = irisR * 0.38;
  const irisX = ex + gazeX;
  const irisY = ey + gazeY * 0.5 + droopOuter * 0.15;
  const fullTopY = ey - eh;
  const lidOpacity = eyeShape === 'hooded' ? 0.85 : 0.65;
  const lidPath = `M ${innerX} ${innerCornerY}
    C ${cp1x} ${fullTopY - epicanthic * 0.15}, ${cp2x} ${fullTopY - slant * 0.3}, ${outerX} ${outerCornerY}
    C ${cp2x} ${topOuterY + 1}, ${cp1x} ${topInnerY + 1 - epicanthic * 0.1}, ${innerX} ${innerCornerY} Z`;
  const creaseY = fullTopY - 2;
  const creasePath = `M ${innerX + dir * 2} ${creaseY + slant * 0.2 - epicanthic * 0.1}
    C ${cp1x} ${creaseY - 1}, ${cp2x} ${creaseY - slant * 0.2 + droopOuter * 0.2}, ${outerX - dir * 1} ${outerCornerY - 1.5}`;

  return (
    <g key={key}>
      <defs key={`${key}-clip-def-${uid}`}>
        <clipPath id={`${key}-clip-${uid}`}>
          <path d={scleraPath} />
        </clipPath>
      </defs>
      <ellipse key={`${key}-sock`} cx={ex} cy={ey + 1} rx={hw + 2} ry={effEh + 2} fill="rgba(0,0,0,0.04)" />
      <path key={`${key}-scl`} d={scleraPath} fill="#eeeae2" />
      <g key={`${key}-iris`} clipPath={`url(#${key}-clip-${uid})`}
        style={gazeAnimation ? {
          transformBox: 'fill-box' as any,
          transformOrigin: '50% 50%',
          animation: gazeAnimation,
        } : undefined}>
        <circle cx={irisX} cy={irisY} r={irisR + 0.8} fill="#1a1a1a" opacity={0.18} />
        <circle cx={irisX} cy={irisY} r={irisR} fill={irisColor} />
        <circle cx={irisX} cy={irisY} r={irisR * 0.7} fill="none" stroke={irisColor} strokeWidth="0.8" opacity={0.4} />
        <circle cx={irisX} cy={irisY} r={irisR} fill="none" stroke="rgba(0,0,0,0.15)" strokeWidth={irisR * 0.3} />
        <circle cx={irisX} cy={irisY} r={pupilR} fill="#080808" />
        <ellipse cx={irisX + irisR * 0.22} cy={irisY - irisR * 0.22} rx={irisR * 0.28} ry={irisR * 0.24} fill="rgba(255,252,240,0.9)" />
        <circle cx={irisX - irisR * 0.18} cy={irisY + irisR * 0.2} r={irisR * 0.12} fill="rgba(255,255,255,0.5)" />
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
      {eyeShape !== 'hooded' && (
        <path key={`${key}-crease`} d={creasePath}
          stroke="rgba(0,0,0,0.12)" strokeWidth="0.7" fill="none" />
      )}
      {eyeShape === 'hooded' && (
        <path key={`${key}-hood`}
          d={`M ${innerX + dir * 1} ${innerCornerY - 0.5}
              C ${cp1x} ${topInnerY - 0.5}, ${cp2x} ${topOuterY - 0.5 + droopOuter * 0.2}, ${outerX - dir * 1} ${outerCornerY - 0.5}`}
          stroke="rgba(0,0,0,0.18)" strokeWidth="0.9" fill="none" />
      )}
      <path key={`${key}-lash`}
        d={`M ${innerX} ${innerCornerY}
            C ${cp1x} ${topInnerY}, ${cp2x} ${topOuterY + droopOuter * 0.2}, ${outerX} ${outerCornerY}`}
        stroke="rgba(0,0,0,0.4)" strokeWidth={config.gender === 'Female' ? 1.2 : 0.7} fill="none"
      />
      <path key={`${key}-lower`}
        d={`M ${innerX + dir * 1} ${innerCornerY + 0.3}
            C ${cp1x} ${botInnerY + 0.5}, ${cp2x} ${botOuterY + 0.5}, ${outerX - dir * 1} ${outerCornerY + 0.5}`}
        stroke="rgba(0,0,0,0.10)" strokeWidth="0.5" fill="none"
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
      <path key={`${key}-brow`}
        d={`M ${ex - hw * 0.9 * dir} ${fullTopY - 4 + browInner}
            Q ${ex} ${fullTopY - 4 + Math.min(browInner, browOuter) - 3}, ${ex + hw * 1.15 * dir} ${fullTopY - 4 + browOuter + droopOuter * 0.3}`}
        style={browAnimation ? {
          transformBox: 'fill-box' as any,
          transformOrigin: '50% 100%',
          animation: browAnimation,
        } : undefined}
        stroke={hairColor} strokeWidth={config.gender === 'Male' ? 2.5 : 1.6} fill="none" strokeLinecap="round"
      />
    </g>
  );
}
