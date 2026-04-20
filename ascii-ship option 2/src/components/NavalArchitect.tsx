import React, { useEffect, useRef, useState } from 'react';
import { Download, Play, Pause, Settings, RefreshCw, FileImage, FileTerminal, Palette } from 'lucide-react';

const COLS = 160;
const ROWS = 75;
const WATER_LINE = 55;

// Shading gradients for Ultima Ratio Regum style 
const SHADES = [' ', '░', '▒', '▓', '█'];

// Color palettes for Time of Day
const THEMES = {
  Dawn: { 
    sky: '#1e1b4b',
    waterBase: '#312e81',
    waterHigh: '#4f46e5',
    woodBase: [40, 50],  // HSL
    sailBase: [45, 60]
  },
  Noon: {
    sky: '#0f172a',
    waterBase: '#1e40af',
    waterHigh: '#06b6d4',
    woodBase: [30, 40],
    sailBase: [45, 80]
  },
  Dusk: {
    sky: '#2e1065',
    waterBase: '#4c1d95',
    waterHigh: '#9333ea',
    woodBase: [15, 35],
    sailBase: [30, 50]
  },
  Midnight: {
    sky: '#020617',
    waterBase: '#020617',
    waterHigh: '#1e3a8a',
    woodBase: [210, 20],
    sailBase: [210, 30]
  }
};

const SHIP_PROFILES = {
  galleon: { L: 100, aH: 15, aL: 0.25, fH: 22, fL: 0.7, D: 16, masts: [0.2, 0.45, 0.7, 0.85] },
  carrack: { L: 85, aH: 20, aL: 0.35, fH: 28, fL: 0.65, D: 18, masts: [0.25, 0.5, 0.75] },
  fluyt:   { L: 90, aH: 8, aL: 0.2, fH: 6, fL: 0.75, D: 14, masts: [0.2, 0.55, 0.8] },
  pinnace: { L: 70, aH: 6, aL: 0.2, fH: 2, fL: 0.85, D: 10, masts: [0.35, 0.75] }
};

interface Params {
  type: keyof typeof SHIP_PROFILES;
  sizeMultiplier: number;
  windSpeed: number;
  timeOfDay: keyof typeof THEMES;
  sailsUp: boolean;
  damage: {
    hull: boolean;
    mainMast: boolean;
    fire: boolean;
  };
}

class Particle {
  x: number; y: number; vx: number; vy: number; life: number; maxLife: number; type: 'fire' | 'smoke' | 'debris';
  constructor(x: number, y: number, type: 'fire' | 'smoke' | 'debris') {
    this.x = x; this.y = y; this.type = type;
    this.maxLife = type === 'fire' ? 15 + Math.random()*15 : 30 + Math.random()*20;
    this.life = this.maxLife;
    this.vx = (Math.random() - 0.5) * (type === 'debris' ? 2 : 0.5);
    this.vy = type === 'debris' ? Math.random()*-2 : Math.random() * -0.5 - 0.2;
  }
}

export default function NavalArchitect() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>();
  
  const [params, setParams] = useState<Params>({
    type: 'galleon',
    sizeMultiplier: 1.0,
    windSpeed: 0.5,
    timeOfDay: 'Noon',
    sailsUp: true,
    damage: { hull: false, mainMast: false, fire: false }
  });

  const [isPlaying, setIsPlaying] = useState(true);
  const particles = useRef<Particle[]>([]);
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let w = 1280;
    let h = 900;
    canvas.width = w;
    canvas.height = h;

    const cellW = w / COLS;
    const cellH = h / ROWS;

    // The Engine render loop
    const render = () => {
      if (isPlaying) timeRef.current += 0.05;
      const t = timeRef.current;

      const buffer = Array.from({ length: ROWS }, () => 
        Array.from({ length: COLS }, () => ({ char: ' ', color: '#000', bgColor: THEMES[params.timeOfDay].sky }))
      );
      const zBuffer = Array.from({ length: ROWS }, () => new Float32Array(COLS).fill(-Infinity));

      const write = (x: number, y: number, z: number, char: string, color: string, bg?: string) => {
        let ix = Math.floor(x); let iy = Math.floor(y);
        if (ix >= 0 && ix < COLS && iy >= 0 && iy < ROWS) {
          if (z >= zBuffer[iy][ix]) {
            zBuffer[iy][ix] = z;
            buffer[iy][ix].char = char;
            buffer[iy][ix].color = color;
            if (bg) buffer[iy][ix].bgColor = bg;
          }
        }
      };

      const dot = (nx: number, ny: number, nz: number, lx: number, ly: number, lz: number) => {
        return Math.max(0, nx*lx + ny*ly + nz*lz);
      };

      const pTheme = THEMES[params.timeOfDay];
      const pProfile = SHIP_PROFILES[params.type];
      
      const cx = COLS / 2;
      const baseDeck = 40;
      const L = pProfile.L * params.sizeMultiplier;
      const startX = cx - L/2;
      const endX = cx + L/2;

      // Damage positions
      const hullHoleX = startX + L * 0.6;
      const hullHoleY = baseDeck + 5;
      const hullHoleR = 5 * params.sizeMultiplier;

      // 1. Draw Hull (2.5D SDF)
      for (let ix = Math.floor(startX); ix <= Math.ceil(endX); ix++) {
        const px = (ix - startX) / L;
        
        let deckRise = 0;
        if (px < pProfile.aL) deckRise = (1 - px/pProfile.aL) * pProfile.aH * params.sizeMultiplier;
        else if (px > pProfile.fL) deckRise = ((px - pProfile.fL) / (1 - pProfile.fL)) * pProfile.fH * params.sizeMultiplier;
        
        const deckY = baseDeck - deckRise;
        const keelY = baseDeck + pProfile.D * params.sizeMultiplier * (1 - Math.pow(2*(px - 0.5), 2));

        for (let iy = Math.floor(deckY); iy <= Math.ceil(keelY); iy++) {
          const py = (iy - deckY) / (keelY - deckY);
          
          // Thickness profile
          const maxWidth = 10 * params.sizeMultiplier;
          let Z = maxWidth * Math.cos((px - 0.5) * Math.PI) * Math.sin(py * Math.PI * 0.5 + Math.PI/2);
          
          if (Z <= 0) continue;

          // Damage Hull check
          if (params.damage.hull) {
             const dist = Math.hypot(ix - hullHoleX, (iy - hullHoleY)*1.5); // elliptic hole
             if (dist < hullHoleR) {
                // Internal darkness + ribs
                write(ix, iy, 1, Math.random() > 0.8 ? '\\' : '/', '#451a03');
                if (Math.random() > 0.95 && params.damage.fire) particles.current.push(new Particle(ix, iy, 'fire'));
                continue;
             }
          }

          // Normal estimation
          const nx = (px - 0.5) * 2;
          const ny = py - 0.5;
          const nz = 1;
          const len = Math.hypot(nx, ny, nz);
          const brightness = dot(nx/len, ny/len, nz/len, -0.6, -0.6, 0.52);

          const shadeIdx = Math.floor(brightness * 4.9);
          const char = SHADES[Math.max(0, Math.min(4, shadeIdx))];

          // Color calculation
          const [hBase, sBase] = pTheme.woodBase;
          const lightness = 15 + brightness * 35;
          const color = `hsl(${hBase}, ${sBase}%, ${lightness}%)`;
          
          // Details: Gunports
          let isGunport = false;
          if (iy > baseDeck + 2 && iy < keelY - 4) {
             if (py > 0.2 && py < 0.6) {
                if (ix % 7 === 0) isGunport = true;
             }
          }

          write(ix, iy, 10 + Z, isGunport ? '◘' : char, isGunport ? '#000' : color);
        }
      }

      // 2. Masts and Sails
      const mastXs = pProfile.masts.map(ratio => startX + L * ratio);
      
      mastXs.forEach((mX, i) => {
        const isMain = i === 1; // Assuming 2nd mast is mainmast
        const mastH = (isMain ? 35 : i === 0 ? 30 : 25) * params.sizeMultiplier;
        
        let breakY = -1;
        if (params.damage.mainMast && isMain) {
           breakY = baseDeck - 15;
           if (Math.random() > 0.9) particles.current.push(new Particle(mX, breakY, 'debris'));
        }

        const mTopY = baseDeck - mastH;
        // Draw mast pole
        for (let iy = Math.floor(mTopY); iy <= baseDeck; iy++) {
           if (breakY !== -1 && iy < breakY) continue;
           
           if (breakY !== -1 && Math.abs(iy - breakY) < 2) {
              write(mX, iy, 15, '\\', '#78350f');
           } else {
              write(mX, iy, 15, '█', '#451a03');
              // Shading line
              write(mX+1, iy, 14, '▒', '#78350f');
           }
        }

        // Flags
        if (breakY === -1) {
           const flagWave = Math.sin(t * params.windSpeed * 5);
           write(mX, mTopY, 16, flagWave > 0 ? '>' : '~', '#b91c1c');
           write(mX+1, mTopY, 16, flagWave > 0.5 ? '~' : '-', '#dc2626');
        }

        // Sails
        if (params.sailsUp) {
           const numSails = isMain ? 3 : 2;
           for (let s = 0; s < numSails; s++) {
              const sailTopY = mTopY + (s * mastH / numSails) + 2;
              const sailH = (mastH / numSails) - 4;
              
              if (breakY !== -1 && sailTopY < breakY) continue; // Sail lost!

              const [shBase, ssBase] = pTheme.sailBase;
              const sailW = (isMain ? 12 : 10) * params.sizeMultiplier * (1 - s/numSails*0.3);

              for (let u = 0; u <= 1.0; u += 0.05) {
                 for (let v = 0; v <= 1.0; v += 0.02) {
                    const billowForce = Math.sin(u * Math.PI) * 6 * params.windSpeed;
                    
                    // Wind flutter effect
                    const flutter = Math.sin(t * 10 + u * 10 + v * 5) * 0.5 * params.windSpeed;
                    
                    const sX = mX + billowForce + flutter;
                    const sY = sailTopY + u * sailH;
                    const sZ = 16 + (v - 0.5) * sailW * Math.cos(u * Math.PI * 0.5);
                    
                    // Damaged sails - random holes mapping
                    if (params.damage.hull || params.damage.mainMast) { // generic damage indicator applies to sails too if enabled
                        if (Math.random() > 0.98) continue;
                    }

                    // Sail shading
                    const nx = 1;
                    const ny = Math.cos(u * Math.PI) * 2;
                    const nz = v - 0.5;
                    const slen = Math.hypot(nx, ny, nz);
                    const sbright = dot(nx/slen, ny/slen, nz/slen, -0.6, -0.6, 0.52);

                    const sLightness = 30 + sbright * 60;
                    const sColor = `hsl(${shBase}, ${ssBase}%, ${sLightness}%)`;
                    const sChar = sbright > 0.8 ? '░' : sbright > 0.4 ? '▒' : '▓';

                    write(sX, sY, sZ, sChar, sColor);
                 }
              }
           }
        }
      });

      // 3. Spawners & Particles
      if (params.damage.fire && Math.random() > 0.5) {
         particles.current.push(new Particle(startX + Math.random()*L, baseDeck - Math.random()*5, 'fire'));
         particles.current.push(new Particle(startX + Math.random()*L*0.5, baseDeck, 'smoke'));
      }

      particles.current.forEach((p, idx) => {
         p.x += p.vx;
         p.y += p.vy;
         p.life -= 1;
         
         if (p.type === 'fire') {
            const chars = ['*', '^', '#', '@'];
            const colors = ['#fde047', '#f97316', '#ef4444', '#7f1d1d'];
            const stage = Math.min(3, Math.floor((1 - p.life/p.maxLife)*4));
            write(p.x, p.y, 30, chars[stage] || '*', colors[stage]);
         } else if (p.type === 'smoke') {
            const chars = ['░', '▒', '▓', '@'];
            const stage = Math.min(3, Math.floor((1 - p.life/p.maxLife)*4));
            write(p.x, p.y, 30, chars[stage] || '░', `rgba(100,100,100,${p.life/p.maxLife})`);
         } else if (p.type === 'debris') {
            write(p.x, p.y, 25, Math.random() > 0.5 ? '/' : '\\', '#451a03');
            p.vy += 0.1; // gravity
         }
      });
      particles.current = particles.current.filter(p => p.life > 0);

      // 4. Draw Water (overlaps hull!)
      for (let iy = WATER_LINE - 2; iy < ROWS; iy++) {
         for (let ix = 0; ix < COLS; ix++) {
            // Wave displacement
            const waveY = WATER_LINE + Math.sin(ix * 0.1 + t * params.windSpeed * 4) * 1.5 
                                      + Math.cos(ix * 0.05 - t * params.windSpeed * 2) * 1.0;
            
            if (iy >= waveY) {
               const depth = (iy - WATER_LINE) / (ROWS - WATER_LINE); // 0 to 1
               const char = Math.random() > 0.8 ? '~' : Math.random() > 0.5 ? '-' : '=';
               
               const wBright = Math.max(0, Math.sin(ix * 0.2 + t*2) * Math.cos(iy * 0.3));
               
               write(ix, iy, 40 + depth*10, char, wBright > 0.5 ? pTheme.waterHigh : pTheme.waterBase, pTheme.waterBase);
            }
         }
      }

      // Render Buffer to Canvas using Bucketed Drawing for extreme performance
      ctx.fillStyle = pTheme.sky;
      ctx.fillRect(0, 0, w, h);
      
      ctx.font = `${cellH}px "Space Mono", Consolas, monospace`;
      ctx.textBaseline = 'top';

      type Bucket = { [color: string]: { chars: string[], xs: number[], ys: number[] } };
      const buckets: Bucket = {};
      const bgBuckets: Bucket = {};

      for (let iy = 0; iy < ROWS; iy++) {
         for (let ix = 0; ix < COLS; ix++) {
            const cell = buffer[iy][ix];
            if (cell.bgColor !== pTheme.sky) {
                if(!bgBuckets[cell.bgColor]) bgBuckets[cell.bgColor] = { chars:[], xs:[], ys:[] };
                bgBuckets[cell.bgColor].xs.push(ix * cellW);
                bgBuckets[cell.bgColor].ys.push(iy * cellH);
            }
            if (cell.char !== ' ') {
                if(!buckets[cell.color]) buckets[cell.color] = { chars:[], xs:[], ys:[] };
                buckets[cell.color].chars.push(cell.char);
                buckets[cell.color].xs.push(ix * cellW);
                buckets[cell.color].ys.push(iy * cellH);
            }
         }
      }

      // Fill backgrounds
      for (const [color, data] of Object.entries(bgBuckets)) {
         ctx.fillStyle = color;
         for (let i = 0; i < data.xs.length; i++) {
           ctx.fillRect(data.xs[i], data.ys[i], cellW, cellH);
         }
      }
      // Fill text
      for (const [color, data] of Object.entries(buckets)) {
         ctx.fillStyle = color;
         for (let i = 0; i < data.chars.length; i++) {
            ctx.fillText(data.chars[i], data.xs[i], data.ys[i]);
         }
      }

      if (isPlaying) {
        animationRef.current = requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };

  }, [params, isPlaying]);

  const exportPNG = () => {
     if(canvasRef.current) {
        const url = canvasRef.current.toDataURL("image/png");
        const a = document.createElement('a');
        a.href = url;
        a.download = `naval_architect_${params.type}.png`;
        a.click();
     }
  };

  const exportTXT = () => {
      // Re-run simulation for just 1 frame but only capture characters into string
      alert("Text export functionality relies on the canvas visual output. Try exporting as PNG for the full URR experience!");
  };

  const updateDamage = (key: keyof typeof params.damage, val: boolean) => {
      setParams(p => ({ ...p, damage: { ...p.damage, [key]: val }}));
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-300 font-sans overflow-hidden">
      {/* Sidebar Controls */}
      <div className="w-80 bg-slate-900 border-r border-slate-800 p-6 flex flex-col gap-6 overflow-y-auto">
         <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
            <Palette className="w-6 h-6 text-amber-500" />
            <h1 className="text-xl font-bold text-slate-100 tracking-tight">Ultima Ratio <br/>Naval Architect</h1>
         </div>

         <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Vessel Design</h3>
            
            <div className="space-y-1">
              <label className="text-sm font-medium">Class</label>
              <select 
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-colors"
                value={params.type}
                onChange={e => setParams({...params, type: e.target.value as any})}
              >
                 <option value="galleon">Galleon (Heavy Warship)</option>
                 <option value="carrack">Carrack (Massive Castles)</option>
                 <option value="fluyt">Fluyt (Merchant Transporter)</option>
                 <option value="pinnace">Pinnace (Fast & Light)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium flex justify-between">
                <span>Scale Multiplier</span>
                <span className="text-amber-500">{params.sizeMultiplier.toFixed(1)}x</span>
              </label>
              <input type="range" min="0.5" max="1.3" step="0.1" 
                className="w-full accent-amber-500"
                value={params.sizeMultiplier} 
                onChange={e => setParams({...params, sizeMultiplier: parseFloat(e.target.value)})}
              />
            </div>
         </div>

         <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Environment</h3>
            
            <div className="space-y-1">
              <label className="text-sm font-medium">Time of Day</label>
              <select 
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm outline-none"
                value={params.timeOfDay}
                onChange={e => setParams({...params, timeOfDay: e.target.value as any})}
              >
                 <option value="Dawn">Dawn</option>
                 <option value="Noon">Noon</option>
                 <option value="Dusk">Dusk</option>
                 <option value="Midnight">Midnight</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium flex justify-between">
                <span>Wind Velocity</span>
                <span className="text-cyan-500">{params.windSpeed.toFixed(1)} kn</span>
              </label>
              <input type="range" min="0" max="1.5" step="0.1" 
                className="w-full accent-cyan-500"
                value={params.windSpeed} 
                onChange={e => setParams({...params, windSpeed: parseFloat(e.target.value)})}
              />
            </div>
            
            <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-white transition-colors">
               <input type="checkbox" checked={params.sailsUp} onChange={e => setParams({...params, sailsUp: e.target.checked})} className="accent-amber-500 w-4 h-4 rounded" />
               Unfurl Sails
            </label>
         </div>

         <div className="space-y-4">
            <h3 className="text-xs font-bold text-rose-500 uppercase tracking-widest">Damage Control</h3>
            <div className="flex flex-col gap-2">
               <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-white transition-colors">
                 <input type="checkbox" checked={params.damage.mainMast} onChange={e => updateDamage('mainMast', e.target.checked)} className="accent-rose-500 w-4 h-4 rounded" />
                 Mainmast Snapped
               </label>
               <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-white transition-colors">
                 <input type="checkbox" checked={params.damage.hull} onChange={e => updateDamage('hull', e.target.checked)} className="accent-rose-500 w-4 h-4 rounded" />
                 Starboard Hull Breach
               </label>
               <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-white transition-colors">
                 <input type="checkbox" checked={params.damage.fire} onChange={e => updateDamage('fire', e.target.checked)} className="accent-rose-500 w-4 h-4 rounded" />
                 Decks on Fire
               </label>
            </div>
         </div>

         <div className="mt-auto space-y-3 pt-4 border-t border-slate-800">
            <button 
              onClick={() => setIsPlaying(!isPlaying)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded bg-slate-800 hover:bg-slate-700 text-sm font-medium transition-colors border border-slate-700 hover:border-slate-600"
            >
               {isPlaying ? <><Pause className="w-4 h-4"/> Pause Engine</> : <><Play className="w-4 h-4"/> Resume Engine</>}
            </button>
            <button 
              onClick={exportPNG}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium transition-colors shadow-lg shadow-amber-900/20"
            >
               <FileImage className="w-4 h-4"/>
               Export Masterpiece PNG
            </button>
         </div>
      </div>

      {/* Main Canvas Viewport */}
      <div className="flex-1 p-8 flex items-center justify-center bg-black relative" ref={containerRef}>
         <div className="absolute top-4 right-6 text-xs font-mono text-slate-500 flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
            ENGINE_STATE: {isPlaying ? 'ACTIVE' : 'HALTED'} | RES: 160x75
         </div>
         <canvas 
            ref={canvasRef} 
            className="w-full max-w-[1280px] h-auto aspect-[1280/900] shadow-2xl rounded shadow-amber-900/10 border border-slate-900 ring-1 ring-white/5"
            style={{ 
              imageRendering: 'pixelated'
            }}
         />
      </div>
    </div>
  );
}
