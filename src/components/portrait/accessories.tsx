import React from 'react';
import type { PortraitConfig } from '../../utils/portraitConfig';

export function renderPipe(rng: () => number, cx: number, mouthY: number): React.ReactNode {
  const flip = rng() > 0.5 ? 1 : -1;
  const px = cx + flip * 8;
  const py = mouthY + 1;
  const ex = cx + flip * 42;
  const ey = mouthY + 10;

  return (
    <g key="pipe">
      <path d={`M ${px} ${py} L ${ex} ${ey}`}
        stroke="#ddd4c4" strokeWidth="2.5" strokeLinecap="round" />
      <path d={`M ${ex} ${ey} L ${ex - flip * 3} ${ey - 6} L ${ex + flip * 3} ${ey - 5} L ${ex + flip * 5} ${ey + 1} Z`}
        fill="#c8bea8" />
      <circle cx={ex + flip * 1} cy={ey - 5} r={2} fill="#e04400" opacity={0.7} />
      <path d={`M ${ex} ${ey - 4} Q ${ex - flip * 4} ${ey - 14} ${ex + flip * 2} ${ey - 22}`}
        stroke="rgba(200,200,200,0.25)" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d={`M ${ex + flip * 2} ${ey - 6} Q ${ex + flip * 6} ${ey - 16} ${ex - flip * 1} ${ey - 26}`}
        stroke="rgba(200,200,200,0.15)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </g>
  );
}

export function renderEyePatch(
  rng: () => number, cx: number, eyeY: number, eyeSpacing: number, headWidth: number,
): React.ReactNode {
  const side = rng() > 0.5 ? -1 : 1;
  const ex = cx + side * eyeSpacing;
  const earX = cx + side * (headWidth + 2);

  return (
    <g key="eyepatch">
      <path d={`M ${ex - side * 8} ${eyeY - 6} L ${earX} ${eyeY - 10}`}
        stroke="#2a2218" strokeWidth="1.8" />
      <path d={`M ${ex - side * 8} ${eyeY + 5} L ${earX} ${eyeY + 2}`}
        stroke="#2a2218" strokeWidth="1.8" />
      <ellipse cx={ex} cy={eyeY} rx={9} ry={7}
        fill="#1a1610" stroke="#2a2218" strokeWidth="1" />
    </g>
  );
}

export function renderFacialMark(
  config: PortraitConfig, cx: number, eyeY: number, _headWidth: number, chinY: number,
): React.ReactNode {
  const markX = cx + config.facialMarkSide * (8 + config.facialMarkY * 12);
  const range = chinY - eyeY;
  const markY = eyeY + config.facialMarkY * range;
  const r = 0.8 + (config.seed % 10) * 0.12;

  return (
    <circle key="facial-mark" cx={markX} cy={markY} r={r}
      fill="rgba(60,30,10,0.4)" />
  );
}

export function renderFreckles(
  rng: () => number, cx: number, eyeY: number, headWidth: number, noseY: number,
): React.ReactNode {
  const dots: React.ReactNode[] = [];
  const count = 12 + Math.floor(rng() * 15);
  for (let i = 0; i < count; i++) {
    const fx = cx + (rng() - 0.5) * headWidth * 1.4;
    const fy = eyeY - 2 + rng() * (noseY - eyeY + 10);
    if (Math.abs(fx - cx) < headWidth * 0.8) {
      dots.push(
        <circle key={`frk-${i}`} cx={fx} cy={fy} r={0.5 + rng() * 0.6}
          fill="rgba(140,90,50,0.25)" />
      );
    }
  }
  return <g key="freckles">{dots}</g>;
}

export function renderTattoo(
  config: PortraitConfig, rng: () => number,
  cx: number, eyeY: number, headWidth: number, _mouthY: number, chinY: number,
): React.ReactNode {
  const color = config.culturalGroup === 'Swahili' ? 'rgba(0,0,0,0.15)' :
    config.culturalGroup === 'SoutheastAsian' ? 'rgba(20,40,80,0.2)' :
    config.nationality === 'Japanese' ? 'rgba(20,50,80,0.18)' :
    'rgba(20,60,40,0.15)';

  switch (config.tattooType) {
    case 'forehead': {
      const y = eyeY - 28;
      return (
        <g key="tattoo">
          <path d={`M ${cx - 10} ${y} L ${cx + 10} ${y}`} stroke={color} strokeWidth="1.2" />
          <path d={`M ${cx - 7} ${y + 3} L ${cx + 7} ${y + 3}`} stroke={color} strokeWidth="0.8" />
        </g>
      );
    }
    case 'cheek': {
      const side = rng() > 0.5 ? 1 : -1;
      const bx = cx + side * (headWidth - 10);
      const by = eyeY + 14;
      return (
        <g key="tattoo">
          <path d={`M ${bx} ${by} l ${side * 6} 0`} stroke={color} strokeWidth="1" />
          <path d={`M ${bx} ${by + 3} l ${side * 6} 0`} stroke={color} strokeWidth="1" />
          <path d={`M ${bx} ${by + 6} l ${side * 6} 0`} stroke={color} strokeWidth="1" />
        </g>
      );
    }
    case 'chin':
      return (
        <g key="tattoo">
          <path d={`M ${cx - 6} ${chinY - 6} L ${cx} ${chinY + 1} L ${cx + 6} ${chinY - 6}`}
            stroke={color} strokeWidth="1" fill="none" />
          <circle cx={cx} cy={chinY - 2} r={1} fill={color} />
        </g>
      );
    case 'arm':
    default: {
      const side = rng() > 0.5 ? 1 : -1;
      return (
        <g key="tattoo">
          <path d={`M ${cx + side * 12} ${chinY + 10} C ${cx + side * 16} ${chinY + 14}, ${cx + side * 14} ${chinY + 20}, ${cx + side * 10} ${chinY + 18}`}
            stroke={color} strokeWidth="1.2" fill="none" />
          <circle cx={cx + side * 13} cy={chinY + 15} r={2} fill="none" stroke={color} strokeWidth="0.8" />
        </g>
      );
    }
  }
}

export function renderNeckKerchief(config: PortraitConfig, cx: number, chinY: number): React.ReactNode {
  const color = config.kerchiefColor;
  const ty = chinY + 12;
  return (
    <g key="kerchief">
      <path d={`M ${cx - 3} ${ty} L ${cx} ${ty + 6} L ${cx + 3} ${ty} Z`} fill={color} />
      <path d={`M ${cx - 20} ${ty + 2} C ${cx - 10} ${ty - 2}, ${cx + 10} ${ty - 2}, ${cx + 20} ${ty + 2}`}
        stroke={color} strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <path d={`M ${cx - 1} ${ty + 5} L ${cx - 4} ${ty + 14}`} stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d={`M ${cx + 1} ${ty + 5} L ${cx + 3} ${ty + 13}`} stroke={color} strokeWidth="2" strokeLinecap="round" />
    </g>
  );
}

export function renderNeckJewelry(
  config: PortraitConfig, rng: () => number, cx: number, chinY: number,
): React.ReactNode {
  const ny = chinY + 16;

  switch (config.neckJewelryType) {
    case 'cross':
      return (
        <g key="neck-jewelry">
          <path d={`M ${cx - 12} ${chinY + 6} Q ${cx} ${ny + 2} ${cx + 12} ${chinY + 6}`}
            stroke="#a89060" strokeWidth="0.8" fill="none" />
          <rect x={cx - 1.5} y={ny - 1} width={3} height={7} fill="#c8a840" rx={0.3} />
          <rect x={cx - 3.5} y={ny + 1} width={7} height={2.5} fill="#c8a840" rx={0.3} />
        </g>
      );
    case 'beads': {
      const beads: React.ReactNode[] = [];
      const beadCount = 7 + Math.floor(rng() * 4);
      for (let i = 0; i < beadCount; i++) {
        const t = i / (beadCount - 1);
        const bx = cx - 14 + t * 28;
        const by = chinY + 6 + Math.sin(t * Math.PI) * 10;
        const beadColor = rng() > 0.5 ? '#c8a840' : rng() > 0.5 ? '#e04020' : '#2060a0';
        beads.push(<circle key={`bead-${i}`} cx={bx} cy={by} r={1.5} fill={beadColor} />);
      }
      return <g key="neck-jewelry">{beads}</g>;
    }
    case 'coins':
      return (
        <g key="neck-jewelry">
          <path d={`M ${cx - 14} ${chinY + 5} Q ${cx} ${ny + 4} ${cx + 14} ${chinY + 5}`}
            stroke="#a89060" strokeWidth="0.6" fill="none" />
          {[-6, 0, 6].map(dx => (
            <g key={`coin-${dx}`}>
              <circle cx={cx + dx} cy={ny + 1 + Math.abs(dx) * 0.15} r={2.5}
                fill="#d4a020" stroke="#a88020" strokeWidth="0.4" />
              <circle cx={cx + dx} cy={ny + 1 + Math.abs(dx) * 0.15} r={1}
                fill="none" stroke="#a88020" strokeWidth="0.3" />
            </g>
          ))}
        </g>
      );
    case 'pendant':
    default: {
      const gemColor = rng() > 0.5 ? '#2060a0' : rng() > 0.5 ? '#206020' : '#a02020';
      return (
        <g key="neck-jewelry">
          <path d={`M ${cx - 10} ${chinY + 6} Q ${cx} ${ny + 3} ${cx + 10} ${chinY + 6}`}
            stroke="#a89060" strokeWidth="0.8" fill="none" />
          <path d={`M ${cx - 3} ${ny} L ${cx} ${ny + 5} L ${cx + 3} ${ny} Z`}
            fill={gemColor} stroke="#c8a840" strokeWidth="0.5" />
        </g>
      );
    }
  }
}
