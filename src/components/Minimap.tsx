import { useEffect, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import { getTerrainData } from '../utils/terrain';
import { resolveWaterPaletteId } from '../utils/waterPalettes';
import {
  getLiveShipTransform,
  getLiveWalkingTransform,
} from '../utils/livePlayerTransform';

const MAP_SIZE = 150; // pixels
const WORLD_RANGE = 300; // world units across the map
const BUFFER_SIZE = MAP_SIZE + 40; // extra padding for smooth panning
const ROWS_PER_FRAME = 15; // rows of terrain to compute per frame (~2,850 samples)
const REDRAW_DIST = 10; // world units before triggering a new terrain build

export function Minimap({ onClick }: { onClick?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Double-buffered offscreen canvases: display from one while building the other
  const bufferA = useRef<HTMLCanvasElement | null>(null);
  const bufferB = useRef<HTMLCanvasElement | null>(null);
  const displayBuffer = useRef<'A' | 'B'>('A');
  const lastDrawPos = useRef<{x: number, z: number} | null>(null);
  // Progressive build state
  const buildState = useRef<{
    imgData: ImageData;
    ctx: CanvasRenderingContext2D;
    startWorldX: number;
    startWorldZ: number;
    centerX: number;
    centerZ: number;
    currentRow: number;
  } | null>(null);
  const waterPaletteId = useGameStore((state) => resolveWaterPaletteId(state));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Create double buffers
    for (const ref of [bufferA, bufferB]) {
      if (!ref.current) {
        const c = document.createElement('canvas');
        c.width = BUFFER_SIZE;
        c.height = BUFFER_SIZE;
        ref.current = c;
      }
    }

    const getDisplayCanvas = () =>
      displayBuffer.current === 'A' ? bufferA.current! : bufferB.current!;
    const getBuildCanvas = () =>
      displayBuffer.current === 'A' ? bufferB.current! : bufferA.current!;

    lastDrawPos.current = null;
    buildState.current = null;

    let animationFrameId: number;
    const unitsPerPixel = WORLD_RANGE / MAP_SIZE;

    const render = () => {
      const state = useGameStore.getState();
      const shipTransform = getLiveShipTransform();
      const walkingTransform = getLiveWalkingTransform();
      const activePos = state.playerMode === 'ship' ? shipTransform.pos : walkingTransform.pos;
      const activeRot = state.playerMode === 'ship' ? shipTransform.rot : walkingTransform.rot;
      const px = activePos[0];
      const pz = activePos[2];

      // ── Progressive terrain build ──────────────────────────────────────────
      const lastPos = lastDrawPos.current;
      const distMoved = lastPos ? Math.sqrt((px - lastPos.x)**2 + (pz - lastPos.z)**2) : Infinity;

      // Start a new progressive build when we've moved far enough
      if (distMoved > REDRAW_DIST && !buildState.current) {
        const buildCtx = getBuildCanvas().getContext('2d')!;
        buildState.current = {
          imgData: buildCtx.createImageData(BUFFER_SIZE, BUFFER_SIZE),
          ctx: buildCtx,
          startWorldX: px - (BUFFER_SIZE / 2) * unitsPerPixel,
          startWorldZ: pz - (BUFFER_SIZE / 2) * unitsPerPixel,
          centerX: px,
          centerZ: pz,
          currentRow: 0,
        };
      }

      // Process a batch of rows if a build is in progress
      if (buildState.current) {
        const bs = buildState.current;
        const endRow = Math.min(bs.currentRow + ROWS_PER_FRAME, BUFFER_SIZE);

        for (let y = bs.currentRow; y < endRow; y++) {
          for (let x = 0; x < BUFFER_SIZE; x++) {
            const worldX = bs.startWorldX + x * unitsPerPixel;
            const worldZ = bs.startWorldZ + y * unitsPerPixel;
            const { color } = getTerrainData(worldX, worldZ);

            const idx = (y * BUFFER_SIZE + x) * 4;
            bs.imgData.data[idx]     = color[0] * 255;
            bs.imgData.data[idx + 1] = color[1] * 255;
            bs.imgData.data[idx + 2] = color[2] * 255;
            bs.imgData.data[idx + 3] = 255;
          }
        }

        bs.currentRow = endRow;

        // Build complete — swap buffers
        if (bs.currentRow >= BUFFER_SIZE) {
          bs.ctx.putImageData(bs.imgData, 0, 0);
          displayBuffer.current = displayBuffer.current === 'A' ? 'B' : 'A';
          lastDrawPos.current = { x: bs.centerX, z: bs.centerZ };
          buildState.current = null;
        }
      }

      // ── Draw ───────────────────────────────────────────────────────────────
      ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);

      // Draw cached terrain with smooth sub-pixel panning
      if (lastDrawPos.current) {
        const offsetX = (lastDrawPos.current.x - px) / unitsPerPixel;
        const offsetZ = (lastDrawPos.current.z - pz) / unitsPerPixel;

        // Offscreen has 20px padding per side
        ctx.drawImage(getDisplayCanvas(), -20 + offsetX, -20 + offsetZ);
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
  }, [waterPaletteId]);

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
