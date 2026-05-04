import React from 'react';
import type { SkinPalette } from '../../utils/portraitConfig';

export function headPath(
  cx: number, headTop: number, eyeY: number, chinY: number,
  hw: number, jw: number, cw: number, fh: number, jowl: number,
): string {
  const topY = headTop;
  return `M ${cx} ${topY}
    C ${cx + hw * 0.8} ${topY - fh * 0.3}, ${cx + hw + 4} ${topY + fh * 1.5}, ${cx + cw} ${eyeY - 5}
    C ${cx + cw + 1} ${eyeY + 20}, ${cx + jw + 6 + jowl} ${chinY - 20}, ${cx + jw + jowl * 0.5} ${chinY - 5}
    C ${cx + jw * 0.5} ${chinY + 4}, ${cx + 4} ${chinY + 6}, ${cx} ${chinY + 6}
    C ${cx - 4} ${chinY + 6}, ${cx - jw * 0.5} ${chinY + 4}, ${cx - jw - jowl * 0.5} ${chinY - 5}
    C ${cx - jw - 6 - jowl} ${chinY - 20}, ${cx - cw - 1} ${eyeY + 20}, ${cx - cw} ${eyeY - 5}
    C ${cx - hw - 4} ${topY + fh * 1.5}, ${cx - hw * 0.8} ${topY - fh * 0.3}, ${cx} ${topY} Z`;
}

export function renderEars(
  cx: number, earY: number, hw: number, earSize: number, skin: SkinPalette, uid: string,
): React.ReactNode {
  const earTop = earY - earSize * 0.4;
  const earBot = earY + earSize * 0.6;
  const protrude = Math.max(6, earSize * 0.62);
  return (
    <g key="ears">
      <path
        d={`M ${cx - hw + 1} ${earTop} C ${cx - hw - protrude} ${earTop + 2}, ${cx - hw - protrude} ${earBot - 2}, ${cx - hw + 1} ${earBot}
            C ${cx - hw - 1.5} ${earBot - earSize * 0.15}, ${cx - hw - 1.5} ${earTop + earSize * 0.15}, ${cx - hw + 1} ${earTop} Z`}
        fill={`url(#skin-${uid})`}
      />
      <path
        d={`M ${cx - hw - 1.5} ${earTop + 1} C ${cx - hw - protrude + 1} ${earTop + 3}, ${cx - hw - protrude} ${earBot - 3}, ${cx - hw - 1.5} ${earBot - 1}`}
        stroke={skin.blush} strokeWidth="2" fill="none" opacity={0.36} strokeLinecap="round"
      />
      <path
        d={`M ${cx - hw - 1.5} ${earTop + 3} C ${cx - hw - 5} ${earTop + 5}, ${cx - hw - 5} ${earBot - 4}, ${cx - hw - 1.5} ${earBot - 3}`}
        stroke="rgba(0,0,0,0.14)" strokeWidth="0.85" fill="none"
      />
      <path
        d={`M ${cx + hw - 1} ${earTop} C ${cx + hw + protrude} ${earTop + 2}, ${cx + hw + protrude} ${earBot - 2}, ${cx + hw - 1} ${earBot}
            C ${cx + hw + 1.5} ${earBot - earSize * 0.15}, ${cx + hw + 1.5} ${earTop + earSize * 0.15}, ${cx + hw - 1} ${earTop} Z`}
        fill={`url(#skin-${uid})`}
      />
      <path
        d={`M ${cx + hw + 1.5} ${earTop + 1} C ${cx + hw + protrude - 1} ${earTop + 3}, ${cx + hw + protrude} ${earBot - 3}, ${cx + hw + 1.5} ${earBot - 1}`}
        stroke={skin.blush} strokeWidth="2" fill="none" opacity={0.36} strokeLinecap="round"
      />
      <path
        d={`M ${cx + hw + 1.5} ${earTop + 3} C ${cx + hw + 5} ${earTop + 5}, ${cx + hw + 5} ${earBot - 4}, ${cx + hw + 1.5} ${earBot - 3}`}
        stroke="rgba(0,0,0,0.14)" strokeWidth="0.85" fill="none"
      />
    </g>
  );
}

export function renderNose(
  cx: number, eyeY: number, noseY: number, noseLength: number,
  nw: number, nb: number, tip: number, curve: number,
  philtrumDepth: number, mouthY: number, isBroken: boolean,
  skin: SkinPalette,
): React.ReactNode {
  const brkDir = isBroken ? ((Math.round(cx) + Math.round(eyeY)) % 2 === 0 ? 1 : -1) : 0;
  const brkKink = isBroken ? 3.2 : 0;
  const brkBulge = isBroken ? 2.2 : 0;
  const bridgeMidY = eyeY + noseLength * 0.38;
  return (
    <g key="nose">
      <path
        d={`M ${cx - nb} ${eyeY + 4}
            Q ${cx - nb - curve + brkKink * brkDir} ${bridgeMidY}, ${cx - nw} ${noseY}
            C ${cx - nw * 0.5} ${noseY + tip + 5}, ${cx + nw * 0.5} ${noseY + tip + 5}, ${cx + nw} ${noseY}
            Q ${cx + nb + curve + brkKink * brkDir} ${bridgeMidY}, ${cx + nb} ${eyeY + 4} Z`}
        fill="rgba(0,0,0,0.07)"
      />
      {isBroken && (
        <>
          <ellipse cx={cx + brkKink * brkDir * 0.7} cy={bridgeMidY}
            rx={nb + brkBulge} ry={3.2} fill="rgba(0,0,0,0.09)" />
          <path d={`M ${cx + brkKink * brkDir * 0.4} ${eyeY + 6}
                    Q ${cx + brkKink * brkDir * 1.1} ${bridgeMidY - 1},
                      ${cx + brkKink * brkDir * 0.5} ${bridgeMidY + 4}`}
            stroke="rgba(0,0,0,0.14)" strokeWidth="0.9" fill="none" strokeLinecap="round" />
          <path d={`M ${cx - brkKink * brkDir * 0.3} ${eyeY + 8}
                    Q ${cx - brkKink * brkDir * 0.6} ${bridgeMidY},
                      ${cx - brkKink * brkDir * 0.2} ${bridgeMidY + 5}`}
            stroke={skin.light} strokeWidth="0.7" fill="none" opacity={0.35} />
        </>
      )}
      <ellipse cx={cx} cy={noseY + tip * 0.4} rx={nw - 0.5} ry={3.5 + Math.abs(tip) * 0.3} fill="rgba(0,0,0,0.06)" />
      <ellipse cx={cx} cy={noseY + tip * 0.3} rx={nw * 0.7} ry={2.2} fill={skin.blush} opacity={0.22} />
      <ellipse cx={cx - nw * 0.45} cy={noseY + 1.5} rx={2.5} ry={2} fill="rgba(0,0,0,0.18)" />
      <ellipse cx={cx + nw * 0.45} cy={noseY + 1.5} rx={2.5} ry={2} fill="rgba(0,0,0,0.18)" />
      <path d={`M ${cx - nw + 1} ${noseY - 1} C ${cx - nw - 1} ${noseY + 1}, ${cx - nw} ${noseY + 3}, ${cx - nw + 2} ${noseY + 3}`}
        stroke="rgba(0,0,0,0.2)" strokeWidth="0.8" fill="none" />
      <path d={`M ${cx + nw - 1} ${noseY - 1} C ${cx + nw + 1} ${noseY + 1}, ${cx + nw} ${noseY + 3}, ${cx + nw - 2} ${noseY + 3}`}
        stroke="rgba(0,0,0,0.2)" strokeWidth="0.8" fill="none" />
      <path
        d={`M ${cx - 1.5} ${noseY + tip + 3} L ${cx - 2} ${mouthY - 3} M ${cx + 1.5} ${noseY + tip + 3} L ${cx + 2} ${mouthY - 3}`}
        stroke="rgba(0,0,0,0.06)" strokeWidth={philtrumDepth} fill="none"
      />
    </g>
  );
}

export function renderWrinkles(
  cx: number, eyeY: number, noseY: number, mouthY: number,
  eyeSpacing: number, noseWidth: number, headWidth: number, alpha: number,
): React.ReactNode {
  const deep = alpha > 0.4;
  const deeper = alpha > 0.6;
  return (
    <g key="wrinkles" stroke="rgba(0,0,0,0.22)" strokeWidth="0.7" fill="none" opacity={alpha}>
      <path d={`M ${cx - noseWidth - 3} ${noseY + 2} Q ${cx - 20} ${mouthY}, ${cx - 22} ${mouthY + 8}`} />
      <path d={`M ${cx + noseWidth + 3} ${noseY + 2} Q ${cx + 20} ${mouthY}, ${cx + 22} ${mouthY + 8}`} />
      {deep && (
        <>
          <path d={`M ${cx - noseWidth - 1} ${noseY + 5} Q ${cx - 17} ${mouthY + 1}, ${cx - 18} ${mouthY + 7}`}
            strokeWidth="0.5" opacity={0.75} />
          <path d={`M ${cx + noseWidth + 1} ${noseY + 5} Q ${cx + 17} ${mouthY + 1}, ${cx + 18} ${mouthY + 7}`}
            strokeWidth="0.5" opacity={0.75} />
        </>
      )}
      <path d={`M ${cx - headWidth + 10} ${eyeY - 30} Q ${cx} ${eyeY - 32} ${cx + headWidth - 10} ${eyeY - 30}`} />
      <path d={`M ${cx - headWidth + 14} ${eyeY - 24} Q ${cx} ${eyeY - 26} ${cx + headWidth - 14} ${eyeY - 24}`} />
      {deep && (
        <path d={`M ${cx - headWidth + 12} ${eyeY - 18} Q ${cx} ${eyeY - 20} ${cx + headWidth - 12} ${eyeY - 18}`}
          strokeWidth="0.55" />
      )}
      {deeper && (
        <>
          <path d={`M ${cx - 2.5} ${eyeY - 12} l 0 7`} strokeWidth="0.65" />
          <path d={`M ${cx + 2.5} ${eyeY - 12} l 0 7`} strokeWidth="0.65" />
        </>
      )}
      <path d={`M ${cx - eyeSpacing - 9} ${eyeY - 1} l -4 -2 M ${cx - eyeSpacing - 9} ${eyeY + 2} l -4 2`} />
      <path d={`M ${cx + eyeSpacing + 9} ${eyeY - 1} l 4 -2 M ${cx + eyeSpacing + 9} ${eyeY + 2} l 4 2`} />
      {deep && (
        <>
          <path d={`M ${cx - eyeSpacing - 10} ${eyeY} l -5 0`} strokeWidth="0.55" />
          <path d={`M ${cx + eyeSpacing + 10} ${eyeY} l 5 0`} strokeWidth="0.55" />
          <path d={`M ${cx - eyeSpacing - 9} ${eyeY + 5} l -4 3`} strokeWidth="0.55" />
          <path d={`M ${cx + eyeSpacing + 9} ${eyeY + 5} l 4 3`} strokeWidth="0.55" />
        </>
      )}
      {deeper && (
        <>
          <path d={`M ${cx - 11} ${mouthY + 5} q -1 5 -2 10`} strokeWidth="0.6" />
          <path d={`M ${cx + 11} ${mouthY + 5} q 1 5 2 10`} strokeWidth="0.6" />
        </>
      )}
    </g>
  );
}
