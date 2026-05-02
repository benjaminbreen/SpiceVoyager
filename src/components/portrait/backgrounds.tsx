import React from 'react';
import type { PortraitConfig } from '../../utils/portraitConfig';

export function getRoleBgColor(config: PortraitConfig): string {
  switch (config.role) {
    case 'Captain':   return '#2a2818';
    case 'Navigator': return '#182028';
    case 'Gunner':    return '#281818';
    case 'Factor':    return '#182818';
    case 'Surgeon':   return '#201820';
    default:          return '#1a1e22';
  }
}

export function getCulturalAccent(group: PortraitConfig['culturalGroup']): { color: string; opacity: number } {
  switch (group) {
    case 'ArabPersian':    return { color: '#c89040', opacity: 0.18 };
    case 'Indian':         return { color: '#d4882c', opacity: 0.16 };
    case 'Swahili':        return { color: '#a0603a', opacity: 0.18 };
    case 'NorthEuropean':  return { color: '#6888a8', opacity: 0.14 };
    case 'SouthEuropean':  return { color: '#887050', opacity: 0.15 };
    case 'EastAsian':      return { color: '#508868', opacity: 0.14 };
    case 'SoutheastAsian': return { color: '#5a9080', opacity: 0.15 };
    default:               return { color: '#808080', opacity: 0.10 };
  }
}

export function renderCaptainFlag(nationality: PortraitConfig['nationality'], uid: string): React.ReactNode {
  void uid;
  const w = 200, h = 250;
  switch (nationality) {
    case 'Portuguese':
      return (<g key="flag">
        <rect width={w} height={h} fill="#003399" />
        <rect x={0} y={0} width={w * 0.4} height={h} fill="#006600" />
        <circle cx={w * 0.4} cy={h * 0.42} r={28} fill="#ff0" />
        <circle cx={w * 0.4} cy={h * 0.42} r={20} fill="#003399" />
        {[-8, 8, 0, -6, 6].map((dx, i) => (
          <circle key={i} cx={w * 0.4 + dx} cy={h * 0.42 + (i < 2 ? -6 : i === 2 ? 0 : 6)} r={3} fill="#fff" />
        ))}
      </g>);
    case 'Dutch':
      return (<g key="flag">
        <rect width={w} height={h / 3} fill="#c84b20" />
        <rect y={h / 3} width={w} height={h / 3} fill="#fff" />
        <rect y={h * 2 / 3} width={w} height={h / 3} fill="#1e3a7a" />
      </g>);
    case 'English':
      return (<g key="flag">
        <rect width={w} height={h} fill="#fff" />
        <rect x={w * 0.44} y={0} width={w * 0.12} height={h} fill="#c8102e" />
        <rect x={0} y={h * 0.44} width={w} height={h * 0.12} fill="#c8102e" />
      </g>);
    case 'Danish':
      return (<g key="flag">
        <rect width={w} height={h} fill="#c8102e" />
        <rect x={w * 0.3} y={0} width={w * 0.1} height={h} fill="#fff" />
        <rect x={0} y={h * 0.44} width={w} height={h * 0.1} fill="#fff" />
      </g>);
    case 'French':
      return (<g key="flag">
        <rect width={w} height={h} fill="#1a2a6c" />
        {[[100, 80], [70, 140], [130, 140]].map(([fx, fy], i) => (
          <g key={i} transform={`translate(${fx},${fy}) scale(0.7)`}>
            <path d="M0,-12 C-4,-8 -6,-2 -8,4 C-4,2 -1,0 0,4 C1,0 4,2 8,4 C6,-2 4,-8 0,-12Z" fill="#d4a017" />
            <circle cx={0} cy={6} r={2} fill="#d4a017" />
          </g>
        ))}
      </g>);
    case 'Spanish':
      return (<g key="flag">
        <rect width={w} height={h} fill="#f5e6c8" />
        <path d={`M 20,10 L ${w - 20},${h - 10} M ${w - 20},10 L 20,${h - 10}`}
          stroke="#8b1a1a" strokeWidth={18} fill="none" strokeLinecap="round"
          strokeDasharray="4,0" />
        <path d={`M 20,10 L ${w - 20},${h - 10}`}
          stroke="#721515" strokeWidth={6} fill="none" strokeDasharray="3,5" />
        <path d={`M ${w - 20},10 L 20,${h - 10}`}
          stroke="#721515" strokeWidth={6} fill="none" strokeDasharray="3,5" />
      </g>);
    case 'Ottoman':
      return (<g key="flag">
        <rect width={w} height={h} fill="#c8102e" />
        <circle cx={95} cy={h * 0.42} r={22} fill="#fff" />
        <circle cx={103} cy={h * 0.42} r={18} fill="#c8102e" />
        <polygon points="128,95 132,107 124,107" fill="#fff" />
      </g>);
    case 'Persian':
      return (<g key="flag">
        <rect width={w} height={h} fill="#1a5e1a" />
        <rect x={20} y={30} width={w - 40} height={h - 60} fill="#f5f0e0" rx={4} />
        <circle cx={100} cy={h * 0.42} r={18} fill="#d4a017" />
        {Array.from({ length: 12 }).map((_, i) => {
          const angle = (i * 30) * Math.PI / 180;
          return <line key={i} x1={100 + Math.cos(angle) * 18} y1={h * 0.42 + Math.sin(angle) * 18}
            x2={100 + Math.cos(angle) * 26} y2={h * 0.42 + Math.sin(angle) * 26}
            stroke="#d4a017" strokeWidth={2} />;
        })}
      </g>);
    case 'Omani':
      return (<g key="flag">
        <rect width={w} height={h} fill="#c8102e" />
        <rect x={0} y={0} width={w * 0.25} height={h} fill="#fff" />
        <path d={`M ${w * 0.5} ${h * 0.3} L ${w * 0.5} ${h * 0.55} M ${w * 0.44} ${h * 0.32} C ${w * 0.47} ${h * 0.28} ${w * 0.53} ${h * 0.28} ${w * 0.56} ${h * 0.32}`}
          stroke="#fff" strokeWidth={3} fill="none" strokeLinecap="round" />
      </g>);
    case 'Mughal':
      return (<g key="flag">
        <rect width={w} height={h} fill="#1a5e1a" />
        <circle cx={100} cy={h * 0.42} r={30} fill="none" stroke="#d4a017" strokeWidth={2} />
        <circle cx={100} cy={h * 0.42} r={22} fill="none" stroke="#d4a017" strokeWidth={1.5} />
        <circle cx={100} cy={h * 0.42} r={6} fill="#d4a017" />
        {[[30, 40], [170, 40], [30, 210], [170, 210]].map(([ox, oy], i) => (
          <circle key={i} cx={ox} cy={oy} r={8} fill="none" stroke="#d4a017" strokeWidth={1} />
        ))}
      </g>);
    case 'Gujarati':
      return (<g key="flag">
        <rect width={w} height={h} fill="#8b4513" />
        <rect x={15} y={20} width={w - 30} height={h - 40} fill="none" stroke="#d4a017" strokeWidth={2} rx={3} />
        <circle cx={100} cy={h * 0.42} r={20} fill="#d4a017" opacity={0.6} />
        <path d="M 90,95 L 100,80 L 110,95 L 105,95 L 105,115 L 95,115 L 95,95 Z" fill="#d4a017" opacity={0.8} />
      </g>);
    case 'Swahili':
      return (<g key="flag">
        <rect width={w} height={h} fill="#1a3a5a" />
        <rect y={h * 0.3} width={w} height={h * 0.4} fill="#2a5a3a" />
        <path d={`M 100,${h * 0.3} L 120,${h * 0.6} L 80,${h * 0.6} Z`} fill="#d4a017" opacity={0.5} />
        <line x1={100} y1={h * 0.28} x2={100} y2={h * 0.62} stroke="#d4a017" strokeWidth={2} />
      </g>);
    case 'Malay':
      return (<g key="flag">
        <rect width={w} height={h} fill="#8b0000" />
        <rect y={h * 0.45} width={w} height={h * 0.1} fill="#d4a017" />
        <circle cx={100} cy={h * 0.25} r={16} fill="#d4a017" />
        <circle cx={106} cy={h * 0.25} r={13} fill="#8b0000" />
      </g>);
    case 'Acehnese':
      return (<g key="flag">
        <rect width={w} height={h} fill="#1a5e1a" />
        <circle cx={95} cy={h * 0.42} r={20} fill="#d4a017" />
        <circle cx={102} cy={h * 0.42} r={16} fill="#1a5e1a" />
        <polygon points="125,100 128,110 122,110" fill="#d4a017" />
      </g>);
    case 'Javanese':
      return (<g key="flag">
        <rect width={w} height={h} fill="#5a1a0a" />
        {[0, 1, 2, 3, 4].map(row =>
          [0, 1, 2, 3].map(col => (
            <circle key={`${row}-${col}`} cx={30 + col * 45} cy={30 + row * 50}
              r={12} fill="none" stroke="#d4a017" strokeWidth={1} opacity={0.5} />
          ))
        )}
      </g>);
    case 'Moluccan':
      return (<g key="flag">
        <rect width={w} height={h} fill="#1a3a6a" />
        <rect y={h * 0.6} width={w} height={h * 0.4} fill="#2a6a3a" />
        <polygon points="100,70 106,90 126,90 110,102 116,122 100,110 84,122 90,102 74,90 94,90"
          fill="#d4a017" opacity={0.7} />
      </g>);
    case 'Siamese':
      return (<g key="flag">
        <rect width={w} height={h} fill="#8b0000" />
        <ellipse cx={100} cy={h * 0.42} rx={22} ry={18} fill="#fff" opacity={0.8} />
        <ellipse cx={82} cy={h * 0.38} rx={8} ry={10} fill="#fff" opacity={0.8} />
        <path d="M 78,98 Q 75,115 80,120" stroke="#fff" strokeWidth={3} fill="none" strokeLinecap="round" opacity={0.8} />
      </g>);
    case 'Chinese':
      return (<g key="flag">
        <rect width={w} height={h} fill="#d4a017" />
        <rect x={10} y={10} width={w - 20} height={h - 20} fill="none" stroke="#8b0000" strokeWidth={4} />
        <circle cx={100} cy={h * 0.42} r={28} fill="none" stroke="#8b0000" strokeWidth={3} />
        <circle cx={100} cy={h * 0.42} r={18} fill="none" stroke="#8b0000" strokeWidth={2} />
        <circle cx={100} cy={h * 0.42} r={5} fill="#8b0000" />
      </g>);
    case 'Japanese':
      return (<g key="flag">
        <rect width={w} height={h} fill="#f5f0e0" />
        <circle cx={100} cy={h * 0.42} r={35} fill="#bc002d" />
      </g>);
    default:
      return (<g key="flag"><rect width={w} height={h} fill="#1a1e22" /></g>);
  }
}
