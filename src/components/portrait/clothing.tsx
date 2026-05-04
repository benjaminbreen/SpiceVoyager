import React from 'react';
import type { PortraitConfig, SkinPalette } from '../../utils/portraitConfig';

export function renderClothing(
  config: PortraitConfig, rng: () => number,
  cx: number, chinY: number, skin: SkinPalette,
): React.ReactNode {
  const { culturalGroup, socialClass } = config;
  const paths: React.ReactNode[] = [];

  const workingColors = ['#5c5040', '#4a5560', '#504a3a', '#5c4a4a', '#404a40', '#6a5a44'];
  const merchantColors = ['#3a3028', '#2c3e50', '#4c2424', '#2c4a3b', '#5a4428'];
  const nobleColors = ['#1a1a2e', '#3a0e0e', '#0e2a4a', '#2a4a0e', '#3a0e3a'];

  let color1: string, color2: string;
  if (socialClass === 'Noble') { color1 = nobleColors[Math.floor(rng() * nobleColors.length)]; color2 = '#c8a840'; }
  else if (socialClass === 'Merchant') { color1 = merchantColors[Math.floor(rng() * merchantColors.length)]; color2 = '#2a241e'; }
  else { color1 = workingColors[Math.floor(rng() * workingColors.length)]; color2 = '#3a3228'; }

  if (config.isSailor) {
    const sc = ['#b0a48c', '#8a9aaa', '#2b3036', '#5c4d40', '#7a7268'];
    color1 = sc[Math.floor(rng() * sc.length)];
  }

  const torsoTop = chinY + 15;
  const torsoPath = `M ${cx - 60} 250 L ${cx - 40} ${torsoTop} C ${cx - 20} ${torsoTop - 6}, ${cx + 20} ${torsoTop - 6}, ${cx + 40} ${torsoTop} L ${cx + 60} 250 Z`;
  paths.push(<path key="torso" d={torsoPath} fill={color1} />);

  if (culturalGroup === 'NorthEuropean' || culturalGroup === 'SouthEuropean') {
    const collarTopY = chinY + 6;
    const collarMidY = chinY + 16;
    if (socialClass === 'Noble') {
      paths.push(<path key="band-shadow"
        d={`M ${cx - 30} ${collarTopY + 2} C ${cx - 22} ${collarMidY + 6}, ${cx + 22} ${collarMidY + 6}, ${cx + 30} ${collarTopY + 2}
            L ${cx + 36} ${collarMidY + 14} L ${cx - 36} ${collarMidY + 14} Z`}
        fill="rgba(0,0,0,0.25)" />);
      paths.push(<path key="band"
        d={`M ${cx - 28} ${collarTopY} C ${cx - 20} ${collarMidY + 4}, ${cx + 20} ${collarMidY + 4}, ${cx + 28} ${collarTopY}
            L ${cx + 34} ${collarMidY + 12} L ${cx - 34} ${collarMidY + 12} Z`}
        fill="#f2ece0" stroke="#c8bfa8" strokeWidth="0.6" />);
      paths.push(<path key="band-edge"
        d={`M ${cx - 34} ${collarMidY + 12} L ${cx + 34} ${collarMidY + 12}`}
        stroke="#a89870" strokeWidth="0.5" strokeDasharray="2,1" fill="none" />);
      const doubletPath = `M ${cx - 60} 250 L ${cx - 36} ${collarMidY + 12} L ${cx + 36} ${collarMidY + 12} L ${cx + 60} 250 Z`;
      paths.push(<path key="doublet" d={doubletPath} fill={color1} />);
      paths.push(<path key="doublet-trim" d={`M ${cx} ${collarMidY + 14} L ${cx} 250`} stroke={color2} strokeWidth="2" opacity={0.9} />);
      for (let i = 0; i < 4; i++) {
        const by = collarMidY + 22 + i * 14;
        if (by < 248) paths.push(<circle key={`btn-${i}`} cx={cx} cy={by} r={1.6} fill={color2} />);
      }
    } else if (socialClass === 'Merchant') {
      paths.push(<path key="band"
        d={`M ${cx - 24} ${collarTopY} C ${cx - 16} ${collarMidY + 2}, ${cx + 16} ${collarMidY + 2}, ${cx + 24} ${collarTopY}
            L ${cx + 28} ${collarMidY + 9} L ${cx - 28} ${collarMidY + 9} Z`}
        fill="#ece5d2" stroke="#bdb29a" strokeWidth="0.6" />);
      paths.push(<path key="doublet" d={`M ${cx - 60} 250 L ${cx - 30} ${collarMidY + 9} L ${cx + 30} ${collarMidY + 9} L ${cx + 60} 250 Z`} fill={color1} />);
      paths.push(<path key="lace" d={`M ${cx} ${collarMidY + 11} L ${cx} 250`} stroke={color2} strokeWidth="1.2" opacity={0.7} />);
    } else {
      paths.push(<path key="shirt"
        d={`M ${cx - 60} 250 L ${cx - 28} ${collarTopY + 4} C ${cx - 14} ${collarTopY - 2}, ${cx + 14} ${collarTopY - 2}, ${cx + 28} ${collarTopY + 4} L ${cx + 60} 250 Z`}
        fill={color1} />);
      paths.push(<path key="shirt-v"
        d={`M ${cx - 8} ${collarTopY + 2} L ${cx} ${collarTopY + 14} L ${cx + 8} ${collarTopY + 2}`}
        fill={skin.mid} stroke="rgba(0,0,0,0.18)" strokeWidth="0.6" />);
      paths.push(<path key="shirt-band"
        d={`M ${cx - 28} ${collarTopY + 4} C ${cx - 14} ${collarTopY - 2}, ${cx + 14} ${collarTopY - 2}, ${cx + 28} ${collarTopY + 4}`}
        stroke="rgba(0,0,0,0.25)" strokeWidth="0.7" fill="none" />);
    }
  } else if (culturalGroup === 'ArabPersian' || culturalGroup === 'Indian') {
    if (socialClass === 'Noble') {
      paths.push(<path key="jama-v" d={`M ${cx - 8} ${torsoTop - 3} L ${cx + 18} ${torsoTop + 20} L ${cx + 20} 250 L ${cx - 20} 250 L ${cx - 8} ${torsoTop - 3} Z`}
        fill={color2} opacity={0.6} />);
      paths.push(<path key="jama-trim" d={`M ${cx - 8} ${torsoTop - 3} L ${cx + 18} ${torsoTop + 20}`}
        stroke="#ffd700" strokeWidth="1.5" fill="none" />);
    } else {
      paths.push(<path key="kurta-v" d={`M ${cx - 6} ${torsoTop - 2} L ${cx} ${torsoTop + 12} L ${cx + 6} ${torsoTop - 2}`}
        fill={skin.mid} stroke="rgba(0,0,0,0.15)" strokeWidth="0.5" />);
    }
  } else if (culturalGroup === 'EastAsian') {
    paths.push(<path key="hf-l" d={`M ${cx - 8} ${torsoTop - 2} L ${cx + 12} ${torsoTop + 18}`} stroke={color2} strokeWidth="3" fill="none" />);
    paths.push(<path key="hf-r" d={`M ${cx + 8} ${torsoTop - 2} L ${cx - 4} ${torsoTop + 14}`} stroke={color2} strokeWidth="3" fill="none" />);
  } else if (culturalGroup === 'Swahili') {
    if (socialClass !== 'Working') {
      paths.push(<path key="kanzu-trim" d={`M ${cx - 15} ${torsoTop - 1} C ${cx} ${torsoTop + 4}, ${cx} ${torsoTop + 4}, ${cx + 15} ${torsoTop - 1}`}
        stroke="#c8a840" strokeWidth="1.5" fill="none" />);
    }
  } else if (culturalGroup === 'SoutheastAsian') {
    paths.push(<path key="baju-v" d={`M ${cx - 8} ${torsoTop - 2} L ${cx} ${torsoTop + 8} L ${cx + 8} ${torsoTop - 2}`}
      fill={socialClass === 'Noble' ? color2 : skin.mid} stroke="rgba(0,0,0,0.1)" strokeWidth="0.5" />);
  }

  return <g key="clothing">{paths}</g>;
}
