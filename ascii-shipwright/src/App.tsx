/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { Download, Terminal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { COLORS, CanvasContext, RenderConfig, drawSky, drawWater } from './shipDefinitions';
import { drawHull, drawMastsAndSails } from './shipRenderer';

function renderToHTMLCanvas(htmlCanvas: HTMLCanvasElement, asciiCtx: CanvasContext) {
    const ctx = htmlCanvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    
    const dpr = window.devicePixelRatio || 1;
    const charWidth = 7;
    const charHeight = 10;
    
    htmlCanvas.width = asciiCtx.width * charWidth * dpr;
    htmlCanvas.height = asciiCtx.height * charHeight * dpr;
    htmlCanvas.style.width = `${asciiCtx.width * charWidth}px`;
    htmlCanvas.style.height = `${asciiCtx.height * charHeight}px`;

    ctx.scale(dpr, dpr);

    ctx.fillStyle = COLORS.sky;
    ctx.fillRect(0, 0, asciiCtx.width * charWidth, asciiCtx.height * charHeight);
    
    ctx.font = 'bold 10px "JetBrains Mono", Courier, monospace';
    ctx.textBaseline = 'top';

    for(let y=0; y<asciiCtx.height; y++) {
        for(let x=0; x<asciiCtx.width; x++) {
            let char = asciiCtx.data[y][x];
            if (char.c !== ' ') {
                ctx.fillStyle = char.color;
                ctx.fillText(char.c, x * charWidth, y * charHeight + 1);
            }
        }
    }
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [shipType, setShipType] = useState('galleon');
  const [bowHull, setBowHull] = useState(0);
  const [midHull, setMidHull] = useState(0);
  const [sternHull, setSternHull] = useState(0);
  const [foreMast, setForeMast] = useState(1);
  const [mainMast, setMainMast] = useState(1);
  const [aftMast, setAftMast] = useState(1);
  const [wind, setWind] = useState(1);

  const configRef = useRef<RenderConfig>({
      shipType, 
      damage: { bow: bowHull, mid: midHull, stern: sternHull, foreMast: 1-foreMast, mainMast: 1-mainMast, aftMast: 1-aftMast },
      wind, width: 200, height: 80
  });

  useEffect(() => {
      configRef.current = { 
          shipType, 
          damage: { bow: bowHull, mid: midHull, stern: sternHull, foreMast: 1-foreMast, mainMast: 1-mainMast, aftMast: 1-aftMast },
          wind, width: 200, height: 80 
      };
  }, [shipType, bowHull, midHull, sternHull, foreMast, mainMast, aftMast, wind]);

  useEffect(() => {
     let animationFrame: number;
     let start = performance.now();
     
     const render = (now: number) => {
         let t = (now - start) / 1000;
         const conf = configRef.current;
         const asciiCtx = new CanvasContext(conf.width, conf.height);
         
         drawSky(asciiCtx, t);
         drawHull(asciiCtx, conf, t);
         drawMastsAndSails(asciiCtx, conf, t);
         drawWater(asciiCtx, conf, t);
         
         if (canvasRef.current) {
             renderToHTMLCanvas(canvasRef.current, asciiCtx);
         }
         
         animationFrame = requestAnimationFrame(render);
     };
     
     animationFrame = requestAnimationFrame(render);
     return () => cancelAnimationFrame(animationFrame);
  }, []);

  const exportHTML = () => {
      const conf = configRef.current;
      const asciiCtx = new CanvasContext(conf.width, conf.height);
      drawSky(asciiCtx, 0); 
      drawHull(asciiCtx, conf, 0);
      drawMastsAndSails(asciiCtx, conf, 0);
      drawWater(asciiCtx, conf, 0);
      
      const htmlOutput = asciiCtx.toHTML();
      const fullHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>ASCII Ship - ${conf.shipType}</title>
</head>
<body style="background: ${COLORS.sky}; margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh;">
${htmlOutput}
</body>
</html>`;

      const blob = new Blob([fullHtml], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ascii_ship_${conf.shipType}_1612.html`;
      a.click();
      URL.revokeObjectURL(url);
  };

  const exportText = () => {
      const conf = configRef.current;
      const asciiCtx = new CanvasContext(conf.width, conf.height);
      drawSky(asciiCtx, 0); 
      drawHull(asciiCtx, conf, 0);
      drawMastsAndSails(asciiCtx, conf, 0);
      drawWater(asciiCtx, conf, 0);

      const textOutput = asciiCtx.toPlainText();
      const blob = new Blob([textOutput], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ascii_ship_${conf.shipType}_1612.txt`;
      a.click();
      URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 flex font-sans selection:bg-sky-900">
      
      {/* Sidebar Controls */}
      <div className="w-[340px] border-r border-slate-800 bg-[#061022]/80 p-6 flex flex-col gap-6 overflow-y-auto shrink-0 z-10 backdrop-blur-md">
         <div>
           <h1 className="text-xl font-bold flex items-center gap-2 text-sky-400 font-mono tracking-tight">
             <Terminal size={20} /> ASCII_SHIPWRIGHT
           </h1>
           <p className="text-slate-400 text-xs mt-1 uppercase tracking-wider font-semibold">1612 Vintage Constructor</p>
         </div>
         
         <div className="space-y-6 flex-1 mt-4">
           
           <div>
              <label className="block text-sm font-medium mb-2 text-slate-300">Vessel Style</label>
              <select 
                 value={shipType}
                 onChange={(e) => setShipType(e.target.value)}
                 className="w-full bg-[#0B1832] border border-sky-900/50 text-white text-sm rounded focus:ring-1 focus:ring-sky-500 focus:border-sky-500 p-2.5 outline-none transition-colors"
              >
                  <option value="galleon">Galleon (Spanish/English)</option>
                  <option value="carrack">Carrack (Portuguese)</option>
                  <option value="xebec">Xebec (Mediterranean)</option>
                  <option value="fluyt">Fluyt (Dutch Merchant)</option>
                  <option value="baghla">Baghla (Indian Ocean Dhow)</option>
                  <option value="pinnace">Pinnace (Small Fast)</option>
                  <option value="merchant_cog">Merchant Cog (Small)</option>
              </select>
           </div>
           
           <hr className="border-sky-900/30" />
           
           <div className="space-y-4">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                 <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
                 Environment
              </h3>
              <div className="p-3 bg-[#0B1832] rounded shadow-inner border border-white/5">
                  <label className="flex justify-between text-sm mb-2 text-slate-300 font-medium tracking-tight">
                     <span>Wind Intensity</span>
                     <span className="text-sky-400 font-mono">{wind.toFixed(1)}x</span>
                  </label>
                  <input type="range" min="0" max="2" step="0.1" value={wind} onChange={e => setWind(parseFloat(e.target.value))} className="w-full accent-sky-500" />
              </div>
           </div>

           <hr className="border-sky-900/30" />

           <div className="space-y-4">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                 <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                 Hull Damage
              </h3>
              
              <div className="p-3 bg-[#0B1832] rounded shadow-inner border border-white/5">
                  <label className="flex justify-between text-sm mb-2 text-slate-300 font-medium tracking-tight">
                     <span>Bow (Forward)</span>
                     <span className="text-red-400 font-mono">{Math.round(bowHull*100)}%</span>
                  </label>
                  <input type="range" min="0" max="1" step="0.05" value={bowHull} onChange={e => setBowHull(parseFloat(e.target.value))} className="w-full accent-red-500" />
              </div>

              <div className="p-3 bg-[#0B1832] rounded shadow-inner border border-white/5">
                  <label className="flex justify-between text-sm mb-2 text-slate-300 font-medium tracking-tight">
                     <span>Midship (Cargo)</span>
                     <span className="text-red-400 font-mono">{Math.round(midHull*100)}%</span>
                  </label>
                  <input type="range" min="0" max="1" step="0.05" value={midHull} onChange={e => setMidHull(parseFloat(e.target.value))} className="w-full accent-red-500" />
              </div>

              <div className="p-3 bg-[#0B1832] rounded shadow-inner border border-white/5">
                  <label className="flex justify-between text-sm mb-2 text-slate-300 font-medium tracking-tight">
                     <span>Stern (Aft)</span>
                     <span className="text-red-400 font-mono">{Math.round(sternHull*100)}%</span>
                  </label>
                  <input type="range" min="0" max="1" step="0.05" value={sternHull} onChange={e => setSternHull(parseFloat(e.target.value))} className="w-full accent-red-500" />
              </div>
           </div>

           <hr className="border-sky-900/30" />

           <div className="space-y-4">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                 <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                 Mast Integrity
              </h3>

              <div className="p-3 bg-[#0B1832] rounded shadow-inner border border-white/5">
                  <label className="flex justify-between text-sm mb-2 text-slate-300 font-medium tracking-tight">
                     <span>Fore Mast</span>
                     <span className="text-orange-400 font-mono">{Math.round(foreMast*100)}%</span>
                  </label>
                  <input type="range" min="0" max="1" step="0.05" value={foreMast} onChange={e => setForeMast(parseFloat(e.target.value))} className="w-full accent-orange-500" />
              </div>

              <div className="p-3 bg-[#0B1832] rounded shadow-inner border border-white/5">
                  <label className="flex justify-between text-sm mb-2 text-slate-300 font-medium tracking-tight">
                     <span>Main Mast</span>
                     <span className="text-orange-400 font-mono">{Math.round(mainMast*100)}%</span>
                  </label>
                  <input type="range" min="0" max="1" step="0.05" value={mainMast} onChange={e => setMainMast(parseFloat(e.target.value))} className="w-full accent-orange-500" />
              </div>

              <div className="p-3 bg-[#0B1832] rounded shadow-inner border border-white/5">
                  <label className="flex justify-between text-sm mb-2 text-slate-300 font-medium tracking-tight">
                     <span>Aft / Mizzen</span>
                     <span className="text-orange-400 font-mono">{Math.round(aftMast*100)}%</span>
                  </label>
                  <input type="range" min="0" max="1" step="0.05" value={aftMast} onChange={e => setAftMast(parseFloat(e.target.value))} className="w-full accent-orange-500" />
              </div>
           </div>

         </div>

         <div className="pt-6 border-t border-sky-900/30 flex flex-col gap-3 mt-4">
             <button title="Export with rich colors formatting" onClick={exportHTML} className="w-full flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-500 text-white px-4 py-2.5 rounded font-medium transition-colors text-sm shadow-[0_0_15px_rgba(2,132,199,0.3)] hover:shadow-[0_0_20px_rgba(2,132,199,0.5)]">
                <Download size={16} /> Export Colored HTML
             </button>
             <button title="Export raw ASCII plaintext (no color)" onClick={exportText} className="w-full flex items-center justify-center gap-2 bg-transparent border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white px-4 py-2.5 rounded font-medium transition-colors text-sm">
                <Download size={16} /> Export Plain Text
             </button>
         </div>
      </div>

      {/* Main Display Area */}
      <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden bg-[#020617] p-8">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(14,165,233,0.05)_0%,rgba(2,6,23,1)_70%)] pointer-events-none" />
          <div className="relative shadow-2xl shadow-sky-900/10 rounded-xl overflow-hidden border border-white/5 bg-[#020617] p-4 flex items-center justify-center">
             <canvas ref={canvasRef} className="block render-crispedges max-w-full" style={{imageRendering: "pixelated"}} />
             {/* Vignette Overlay for aesthetic display context */}
             <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_100px_rgba(0,0,0,0.8)] rounded-xl" />
          </div>
          <p className="mt-6 text-slate-500 text-sm font-mono flex items-center gap-3">
             <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
             Simulation Active // Render Mode: High-Res True Type
          </p>
      </div>
      
    </div>
  );
}
