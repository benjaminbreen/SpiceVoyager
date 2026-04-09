import { useEffect, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import { SEA_LEVEL } from '../constants/world';
import { getTerrainData } from '../utils/terrain';

const MAP_SIZE = 150; // pixels
const WORLD_RANGE = 300; // world units across the map

// Check if a pixel is on a coastline by sampling neighbors
function isCoastline(x: number, z: number, step: number): boolean {
  const center = getTerrainData(x, z);
  if (center.height < -1 || center.height > 3) return false; // only near sea level
  const offsets = [[-step, 0], [step, 0], [0, -step], [0, step]];
  const isLand = center.height >= SEA_LEVEL;
  for (const [dx, dz] of offsets) {
    const neighbor = getTerrainData(x + dx, z + dz);
    if ((neighbor.height >= SEA_LEVEL) !== isLand) return true;
  }
  return false;
}

export function Minimap({ onClick }: { onClick?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastDrawPos = useRef<{x: number, z: number} | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Create offscreen canvas for terrain caching
    if (!offscreenCanvasRef.current) {
      const offCanvas = document.createElement('canvas');
      // Make it slightly larger so we can pan smoothly without edge artifacts
      offCanvas.width = MAP_SIZE + 40; 
      offCanvas.height = MAP_SIZE + 40;
      offscreenCanvasRef.current = offCanvas;
    }
    const offCtx = offscreenCanvasRef.current.getContext('2d')!;

    let animationFrameId: number;
    let lastFrameTime = 0;
    const FRAME_INTERVAL = 100; // ms — ~10fps is plenty for a minimap

    const render = (now: number = 0) => {
      if (now - lastFrameTime < FRAME_INTERVAL) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }
      lastFrameTime = now;
      const state = useGameStore.getState();
      const activePos = state.playerMode === 'ship' ? state.playerPos : state.walkingPos;
      const activeRot = state.playerMode === 'ship' ? state.playerRot : state.walkingRot;
      const px = activePos[0];
      const pz = activePos[2];

      // Check if we need to redraw the cached terrain
      const lastPos = lastDrawPos.current;
      const distMoved = lastPos ? Math.sqrt((px - lastPos.x)**2 + (pz - lastPos.z)**2) : Infinity;
      
      const unitsPerPixel = WORLD_RANGE / MAP_SIZE;

      if (distMoved > 5) { // Redraw cache every 5 units
        lastDrawPos.current = { x: px, z: pz };
        
        const pixelsAcross = offscreenCanvasRef.current!.width;
        
        const startWorldX = px - (pixelsAcross / 2) * unitsPerPixel;
        const startWorldZ = pz - (pixelsAcross / 2) * unitsPerPixel;

        const imgData = offCtx.createImageData(pixelsAcross, pixelsAcross);
        
        for (let y = 0; y < pixelsAcross; y++) {
          for (let x = 0; x < pixelsAcross; x++) {
            const worldX = startWorldX + x * unitsPerPixel;
            const worldZ = startWorldZ + y * unitsPerPixel;
            const { color } = getTerrainData(worldX, worldZ);

            const idx = (y * pixelsAcross + x) * 4;

            // Coastline detection — draw dark outline at land/sea borders
            if (isCoastline(worldX, worldZ, unitsPerPixel)) {
              imgData.data[idx] = 40;
              imgData.data[idx+1] = 35;
              imgData.data[idx+2] = 25;
              imgData.data[idx+3] = 255;
            } else {
              imgData.data[idx] = color[0] * 255;
              imgData.data[idx+1] = color[1] * 255;
              imgData.data[idx+2] = color[2] * 255;
              imgData.data[idx+3] = 255;
            }
          }
        }
        offCtx.putImageData(imgData, 0, 0);
      }

      // Clear main canvas
      ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);

      // Draw cached terrain with smooth sub-grid offset
      if (lastDrawPos.current) {
        const offsetX = (lastDrawPos.current.x - px) / unitsPerPixel;
        const offsetZ = (lastDrawPos.current.z - pz) / unitsPerPixel;
        
        // The offscreen canvas is larger by 40 pixels (20 each side)
        ctx.drawImage(offscreenCanvasRef.current!, -20 + offsetX, -20 + offsetZ);
      }

      // Draw Ports
      state.ports.forEach(port => {
        if (!state.discoveredPorts.includes(port.id)) return;

        const dx = port.position[0] - px;
        const dz = port.position[2] - pz;
        
        if (Math.abs(dx) < WORLD_RANGE/2 && Math.abs(dz) < WORLD_RANGE/2) {
          const mapX = MAP_SIZE/2 + (dx / unitsPerPixel);
          const mapY = MAP_SIZE/2 + (dz / unitsPerPixel);
          
          // Port size based on scale
          const scaleMap: Record<string, number> = { 'Small': 3, 'Medium': 4, 'Large': 5, 'Very Large': 6 };
          const portRadius = scaleMap[port.scale] || 4;

          // Draw port marker
          ctx.beginPath();
          ctx.arc(mapX, mapY, portRadius, 0, Math.PI * 2);
          ctx.fillStyle = '#ff4444';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Draw port name
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 10px sans-serif';
          ctx.shadowColor = 'rgba(0,0,0,0.8)';
          ctx.shadowBlur = 2;
          ctx.fillText(port.name, mapX + 6, mapY + 3);
          ctx.shadowBlur = 0; // reset
        }
      });

      // Draw Player Arrow
      ctx.save();
      ctx.translate(MAP_SIZE / 2, MAP_SIZE / 2);
      
      // In our game, rotation 0 moves the ship +Z (South).
      // Canvas rotation 0 points Right (+X).
      // We want the arrow to point in the direction of travel.
      // If rotation is 0, we want it to point Down (+Y on canvas).
      // So canvasAngle = -activeRot + Math.PI/2
      ctx.rotate(-activeRot + Math.PI / 2);
      
      ctx.beginPath();
      ctx.moveTo(6, 0); // Tip pointing right (which is rotated to the correct direction)
      ctx.lineTo(-4, -4);
      ctx.lineTo(-2, 0);
      ctx.lineTo(-4, 4);
      ctx.closePath();
      
      ctx.fillStyle = state.playerMode === 'ship' ? '#ffffff' : '#ffccaa';
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  return (
    <div
      onClick={onClick}
      className={`w-36 h-36 rounded-full border-[5px] border-amber-900/90 bg-blue-900/50 shadow-[0_0_20px_rgba(0,0,0,0.6),inset_0_0_15px_rgba(0,0,0,0.8)] overflow-hidden flex items-center justify-center backdrop-blur-sm ${onClick ? 'cursor-pointer hover:border-amber-600 hover:shadow-[0_0_25px_rgba(245,158,11,0.3)] transition-all active:scale-95' : ''}`}
    >
      {/* Compass markings */}
      <div className="absolute inset-0 pointer-events-none z-10">
        <span className="absolute top-0.5 left-1/2 -translate-x-1/2 text-amber-500 font-bold text-[9px] drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">N</span>
        <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-amber-500 font-bold text-[9px] drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">S</span>
        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-amber-500 font-bold text-[9px] drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">W</span>
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-amber-500 font-bold text-[9px] drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">E</span>

        {/* Crosshair */}
        <div className="absolute top-1/2 left-0 w-full h-[1px] bg-white/10" />
        <div className="absolute top-0 left-1/2 w-[1px] h-full bg-white/10" />

        {/* Inner ring */}
        <div className="absolute inset-1.5 rounded-full border border-white/10" />
        <div className="absolute inset-6 rounded-full border border-white/5" />
      </div>

      <canvas
        ref={canvasRef}
        width={MAP_SIZE}
        height={MAP_SIZE}
        className="rounded-full opacity-90"
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
