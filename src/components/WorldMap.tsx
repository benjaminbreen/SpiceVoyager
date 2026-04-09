import { useEffect, useRef, useState, useCallback } from 'react';
import { useGameStore } from '../store/gameStore';
import { SEA_LEVEL } from '../constants/world';
import { getTerrainData } from '../utils/terrain';
import { motion } from 'framer-motion';
import { X, Compass, ZoomIn, ZoomOut, Crosshair } from 'lucide-react';

const WORLD_HALF = 1000;
const TERRAIN_RESOLUTION = 1200; // pixels for the terrain texture (pre-rendered once)
const UNITS_PER_PIXEL = (WORLD_HALF * 2) / TERRAIN_RESOLUTION;

// ── Module-level terrain cache (pre-renders in background at import time) ─────
let _terrainCanvas: HTMLCanvasElement | null = null;
let _terrainReady = false;
const _readyCallbacks: Array<() => void> = [];

function onTerrainReady(cb: () => void) {
  if (_terrainReady) { cb(); return; }
  _readyCallbacks.push(cb);
}

function _preRenderTerrain() {
  const imgData = new ImageData(TERRAIN_RESOLUTION, TERRAIN_RESOLUTION);
  let row = 0;
  const CHUNK_SIZE = 40; // rows per frame

  const renderChunk = () => {
    const endRow = Math.min(row + CHUNK_SIZE, TERRAIN_RESOLUTION);
    for (let y = row; y < endRow; y++) {
      for (let x = 0; x < TERRAIN_RESOLUTION; x++) {
        const worldX = -WORLD_HALF + x * UNITS_PER_PIXEL;
        const worldZ = -WORLD_HALF + y * UNITS_PER_PIXEL;
        const terrain = getTerrainData(worldX, worldZ);
        const idx = (y * TERRAIN_RESOLUTION + x) * 4;

        if (isCoastline(worldX, worldZ, UNITS_PER_PIXEL)) {
          imgData.data[idx] = 35;
          imgData.data[idx + 1] = 30;
          imgData.data[idx + 2] = 20;
          imgData.data[idx + 3] = 255;
          continue;
        }

        const terrainTint = tintColor(terrain.color[0], terrain.color[1], terrain.color[2]);
        let [r, g, b] = terrain.height < SEA_LEVEL
          ? (() => {
              const stylizedOcean = oceanColor(terrain.height);
              const blend = Math.min(1, terrain.shallowFactor * 0.8 + terrain.surfFactor * 0.7);
              return [
                stylizedOcean[0] * (1 - blend) + terrainTint[0] * blend,
                stylizedOcean[1] * (1 - blend) + terrainTint[1] * blend,
                stylizedOcean[2] * (1 - blend) + terrainTint[2] * blend,
              ] as [number, number, number];
            })()
          : terrainTint;

        if (terrain.height > 0) {
          const hs = getHillshade(worldX, worldZ, UNITS_PER_PIXEL * 2);
          r = Math.min(1, r * hs);
          g = Math.min(1, g * hs);
          b = Math.min(1, b * hs);
        }

        imgData.data[idx] = r * 255;
        imgData.data[idx + 1] = g * 255;
        imgData.data[idx + 2] = b * 255;
        imgData.data[idx + 3] = 255;
      }
    }
    row = endRow;
    if (row < TERRAIN_RESOLUTION) {
      requestAnimationFrame(renderChunk);
    } else {
      const tc = document.createElement('canvas');
      tc.width = TERRAIN_RESOLUTION;
      tc.height = TERRAIN_RESOLUTION;
      tc.getContext('2d')!.putImageData(imgData, 0, 0);
      _terrainCanvas = tc;
      _terrainReady = true;
      for (const cb of _readyCallbacks) cb();
      _readyCallbacks.length = 0;
    }
  };

  renderChunk();
}

/** Call this once after the world/terrain is initialized to start background rendering */
export function startTerrainPreRender() {
  if (_terrainReady || _readyCallbacks.length > 0) return; // already started or done
  _preRenderTerrain();
}

/** Invalidate the cache (call after fast-travel regenerates the world) */
export function invalidateTerrainCache() {
  _terrainCanvas = null;
  _terrainReady = false;
}

// Warm sepia tint for the terrain to give a vintage cartographic feel
function tintColor(r: number, g: number, b: number): [number, number, number] {
  const warmR = r * 0.75 + 0.25 * 0.92;
  const warmG = g * 0.75 + 0.25 * 0.82;
  const warmB = b * 0.65 + 0.35 * 0.62;
  return [warmR, warmG, warmB];
}

// Ocean gets a richer, more stylized blue
function oceanColor(height: number): [number, number, number] {
  const depth = Math.min(1, Math.abs(height) / 20);
  const r = 0.12 - depth * 0.04;
  const g = 0.28 - depth * 0.06;
  const b = 0.48 - depth * 0.08;
  return tintColor(r, g, b);
}

// Hillshading: compute illumination from NW light source using neighboring heights
function getHillshade(x: number, z: number, step: number): number {
  const hL = getTerrainData(x - step, z).height;
  const hR = getTerrainData(x + step, z).height;
  const hU = getTerrainData(x, z - step).height;
  const hD = getTerrainData(x, z + step).height;
  // Normal approximation
  const dx = (hL - hR) / (2 * step);
  const dz = (hU - hD) / (2 * step);
  // Light from NW, elevated 45 degrees
  const lightX = -0.7071;
  const lightZ = -0.7071;
  const lightY = 0.7071;
  const len = Math.sqrt(dx * dx + dz * dz + 1);
  const shade = (dx * lightX + dz * lightZ + lightY) / len;
  return Math.max(0.3, Math.min(1.2, shade + 0.5));
}

// Coastline detection
function isCoastline(x: number, z: number, step: number): boolean {
  const center = getTerrainData(x, z);
  if (center.height < -2 || center.height > 4) return false;
  const isLand = center.height >= SEA_LEVEL;
  const offsets = [[-step, 0], [step, 0], [0, -step], [0, step]];
  for (const [dx, dz] of offsets) {
    if ((getTerrainData(x + dx, z + dz).height >= SEA_LEVEL) !== isLand) return true;
  }
  return false;
}

interface WorldMapProps {
  onClose: () => void;
}

export function WorldMap({ onClose }: WorldMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredPort, setHoveredPort] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(!_terrainReady);
  const containerRef = useRef<HTMLDivElement>(null);

  const playerPos = useGameStore(s => s.playerPos);
  const ports = useGameStore(s => s.ports);
  const discoveredPorts = useGameStore(s => s.discoveredPorts);
  const playerRot = useGameStore(s => s.playerRot);
  const playerMode = useGameStore(s => s.playerMode);

  // Wait for the module-level pre-render (usually already done by the time modal opens)
  useEffect(() => {
    if (_terrainReady) {
      setIsRendering(false);
      return;
    }
    // If somehow not ready yet, start it and wait
    startTerrainPreRender();
    onTerrainReady(() => setIsRendering(false));
  }, []);

  // Center on player initially
  useEffect(() => {
    setOffset({
      x: -(playerPos[0] / WORLD_HALF) * 0.5,
      y: -(playerPos[2] / WORLD_HALF) * 0.5,
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts: +/- to zoom, Escape to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case '=': case '+':
          setZoom(prev => Math.min(4, prev + 0.2));
          e.preventDefault();
          break;
        case '-': case '_':
          setZoom(prev => Math.max(0.5, prev - 0.2));
          e.preventDefault();
          break;
        case 'Escape':
          onClose();
          break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Handle DPR-aware canvas sizing
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
  }, [isRendering]);

  // Draw the map
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !_terrainCanvas || !container) return;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    // Resize if needed
    if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.scale(dpr, dpr);
    }

    ctx.clearRect(0, 0, w, h);

    // Enable smooth image interpolation for terrain upscaling
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(offset.x * w / 2, offset.y * h / 2);

    // Draw the pre-rendered terrain canvas scaled to fill
    ctx.drawImage(_terrainCanvas!, -w / 2, -h / 2, w, h);

    // Grid lines (subtle lat/long style)
    ctx.strokeStyle = 'rgba(139, 90, 43, 0.12)';
    ctx.lineWidth = 0.5 / zoom;
    const gridStep = w / 10;
    for (let i = -5; i <= 5; i++) {
      ctx.beginPath();
      ctx.moveTo(i * gridStep, -h / 2);
      ctx.lineTo(i * gridStep, h / 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-w / 2, i * gridStep);
      ctx.lineTo(w / 2, i * gridStep);
      ctx.stroke();
    }

    // Helper: world coords to canvas coords
    const worldToCanvas = (wx: number, wz: number) => ({
      x: (wx / WORLD_HALF) * (w / 2),
      y: (wz / WORLD_HALF) * (h / 2),
    });

    // Draw trade route lines between discovered ports (subtle)
    if (discoveredPorts.length > 1) {
      ctx.strokeStyle = 'rgba(200, 170, 120, 0.2)';
      ctx.lineWidth = 1.5 / zoom;
      ctx.setLineDash([6 / zoom, 4 / zoom]);
      const discovered = ports.filter(p => discoveredPorts.includes(p.id));
      for (let i = 0; i < discovered.length; i++) {
        for (let j = i + 1; j < discovered.length; j++) {
          const a = worldToCanvas(discovered[i].position[0], discovered[i].position[2]);
          const b = worldToCanvas(discovered[j].position[0], discovered[j].position[2]);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);
    }

    // Draw ports
    ports.forEach(port => {
      const isDiscovered = discoveredPorts.includes(port.id);
      const pos = worldToCanvas(port.position[0], port.position[2]);
      const isHovered = hoveredPort === port.id;
      const scaleMap: Record<string, number> = { 'Small': 4, 'Medium': 5, 'Large': 6, 'Very Large': 7 };
      const portSize = scaleMap[port.scale] || 5;
      const baseSize = (isHovered ? portSize + 2 : portSize) / zoom;

      if (!isDiscovered) {
        // Undiscovered: subtle hint marker
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 3 / zoom, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(139, 90, 43, 0.25)';
        ctx.fill();
        return;
      }

      // Port glow
      const gradient = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, baseSize * 2.5);
      gradient.addColorStop(0, 'rgba(220, 160, 60, 0.4)');
      gradient.addColorStop(1, 'rgba(220, 160, 60, 0)');
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, baseSize * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      // Port dot
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, baseSize, 0, Math.PI * 2);
      ctx.fillStyle = isHovered ? '#ffcc44' : '#c8553d';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1.5 / zoom;
      ctx.stroke();

      // Inner highlight
      ctx.beginPath();
      ctx.arc(pos.x, pos.y - 1 / zoom, baseSize * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fill();

      // Port name
      const fontSize = Math.max(10, 13 / zoom);
      ctx.font = `600 ${fontSize}px "Inter", system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';

      // Text background
      const textWidth = ctx.measureText(port.name).width;
      const textX = pos.x + baseSize + 6 / zoom;
      const textY = pos.y;
      ctx.fillStyle = 'rgba(10, 14, 24, 0.6)';
      const padding = 3 / zoom;
      ctx.beginPath();
      const radius = 3 / zoom;
      const rectX = textX - padding;
      const rectY = textY - fontSize / 2 - padding;
      const rectW = textWidth + padding * 2;
      const rectH = fontSize + padding * 2;
      ctx.roundRect(rectX, rectY, rectW, rectH, radius);
      ctx.fill();

      ctx.fillStyle = '#e6d5ac';
      ctx.fillText(port.name, textX, textY);
    });

    // Bearing line from player to hovered port
    if (hoveredPort) {
      const hp = ports.find(p => p.id === hoveredPort);
      if (hp && discoveredPorts.includes(hp.id)) {
        const hpos = worldToCanvas(hp.position[0], hp.position[2]);
        const ppos = worldToCanvas(playerPos[0], playerPos[2]);

        ctx.strokeStyle = 'rgba(255, 200, 80, 0.5)';
        ctx.lineWidth = 1.5 / zoom;
        ctx.setLineDash([4 / zoom, 4 / zoom]);
        ctx.beginPath();
        ctx.moveTo(ppos.x, ppos.y);
        ctx.lineTo(hpos.x, hpos.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Bearing label at midpoint
        const midX = (ppos.x + hpos.x) / 2;
        const midY = (ppos.y + hpos.y) / 2;
        const dx = hp.position[0] - playerPos[0];
        const dz = hp.position[2] - playerPos[2];
        const bearing = ((Math.atan2(dx, -dz) * 180 / Math.PI) + 360) % 360;
        const dist = Math.round(Math.sqrt(dx * dx + dz * dz));

        const bearingText = `${Math.round(bearing)}° · ${dist}u`;
        const bFontSize = Math.max(9, 11 / zoom);
        ctx.font = `600 ${bFontSize}px "Inter", system-ui, sans-serif`;
        const bw = ctx.measureText(bearingText).width;
        const bpad = 3 / zoom;
        ctx.fillStyle = 'rgba(10, 14, 24, 0.7)';
        ctx.beginPath();
        ctx.roundRect(midX - bw / 2 - bpad, midY - bFontSize / 2 - bpad, bw + bpad * 2, bFontSize + bpad * 2, 3 / zoom);
        ctx.fill();
        ctx.fillStyle = '#fbbf24';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(bearingText, midX, midY);
        ctx.textAlign = 'left';
      }
    }

    // Draw player
    const pp = worldToCanvas(playerPos[0], playerPos[2]);

    // Player trail glow
    const playerGlow = ctx.createRadialGradient(pp.x, pp.y, 0, pp.x, pp.y, 18 / zoom);
    playerGlow.addColorStop(0, 'rgba(100, 180, 255, 0.35)');
    playerGlow.addColorStop(0.6, 'rgba(100, 180, 255, 0.1)');
    playerGlow.addColorStop(1, 'rgba(100, 180, 255, 0)');
    ctx.beginPath();
    ctx.arc(pp.x, pp.y, 18 / zoom, 0, Math.PI * 2);
    ctx.fillStyle = playerGlow;
    ctx.fill();

    // Player direction arrow
    ctx.save();
    ctx.translate(pp.x, pp.y);
    ctx.rotate(-playerRot + Math.PI / 2);
    const arrowSize = 8 / zoom;

    ctx.beginPath();
    ctx.moveTo(arrowSize * 1.2, 0);
    ctx.lineTo(-arrowSize * 0.6, -arrowSize * 0.7);
    ctx.lineTo(-arrowSize * 0.2, 0);
    ctx.lineTo(-arrowSize * 0.6, arrowSize * 0.7);
    ctx.closePath();

    ctx.fillStyle = playerMode === 'ship' ? '#60a5fa' : '#fbbf24';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5 / zoom;
    ctx.stroke();
    ctx.restore();

    // Pulsing ring around player
    const pulse = (Date.now() % 2000) / 2000;
    const pulseRadius = (12 + pulse * 10) / zoom;
    ctx.beginPath();
    ctx.arc(pp.x, pp.y, pulseRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(100, 180, 255, ${0.5 - pulse * 0.5})`;
    ctx.lineWidth = 1.5 / zoom;
    ctx.stroke();

    ctx.restore();
  }, [zoom, offset, hoveredPort, playerPos, playerRot, playerMode, ports, discoveredPorts]);

  // Animation loop for the pulsing effect
  useEffect(() => {
    if (isRendering) return;
    let running = true;
    const animate = () => {
      if (!running) return;
      draw();
      requestAnimationFrame(animate);
    };
    animate();
    return () => { running = false; };
  }, [draw, isRendering]);

  // Mouse handlers for pan
  const handleMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Use CSS pixel dimensions (not DPR-scaled canvas.width)
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Reverse the transform to get world coordinates
    const cx = (mouseX - w / 2) / zoom - offset.x * w / 2;
    const cy = (mouseY - h / 2) / zoom - offset.y * h / 2;
    const worldX = (cx / (w / 2)) * WORLD_HALF;
    const worldZ = (cy / (h / 2)) * WORLD_HALF;

    let found: string | null = null;
    ports.forEach(port => {
      if (!discoveredPorts.includes(port.id)) return;
      const dx = port.position[0] - worldX;
      const dz = port.position[2] - worldZ;
      if (Math.sqrt(dx * dx + dz * dz) < 30 / zoom) {
        found = port.id;
      }
    });
    setHoveredPort(found);

    if (dragging) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      const scale = 2 / (w * zoom);
      setOffset(prev => ({
        x: prev.x + dx * scale,
        y: prev.y + dy * scale,
      }));
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = () => setDragging(false);

  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setZoom(prev => Math.max(0.5, Math.min(4, prev + delta)));
  };

  const centerOnPlayer = () => {
    setOffset({
      x: -(playerPos[0] / WORLD_HALF) * 0.5,
      y: -(playerPos[2] / WORLD_HALF) * 0.5,
    });
    setZoom(1.5);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="absolute inset-0 bg-black/70 backdrop-blur-sm pointer-events-auto flex items-center justify-center p-6 z-40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        ref={containerRef}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="relative w-full max-w-5xl aspect-[4/3] rounded-2xl overflow-hidden
          bg-[#0a0e18]/80 backdrop-blur-xl border border-[#2a2d3a]/50
          shadow-[0_8px_40px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.05)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar */}
        <div className="absolute top-0 left-0 right-0 h-12 flex items-center justify-between px-5 z-20
          bg-gradient-to-b from-[#0a0e18]/90 to-transparent">
          <div className="flex items-center gap-3">
            <Compass size={18} className="text-amber-400" />
            <span className="text-amber-200/90 text-sm font-semibold tracking-wide uppercase">
              Navigation Chart
            </span>
            <span className="text-[#6a6d7a] text-xs ml-2">
              {discoveredPorts.length} / {ports.length} ports discovered
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10
              flex items-center justify-center transition-all hover:border-white/20"
          >
            <X size={16} className="text-white/60" />
          </button>
        </div>

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          className={`w-full h-full ${dragging ? 'cursor-grabbing' : hoveredPort ? 'cursor-pointer' : 'cursor-grab'}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        />

        {/* Loading overlay */}
        {isRendering && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0e18]/90 z-30">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
              <span className="text-amber-200/70 text-sm">Rendering chart...</span>
            </div>
          </div>
        )}

        {/* Zoom controls */}
        <div className="absolute bottom-4 right-4 flex flex-col gap-1.5 z-20">
          <button
            onClick={() => setZoom(prev => Math.min(4, prev + 0.3))}
            className="w-9 h-9 rounded-lg bg-[#0a0e18]/70 backdrop-blur-sm border border-[#2a2d3a]/40
              flex items-center justify-center text-white/60 hover:text-white hover:bg-[#0a0e18]/90
              transition-all shadow-lg"
          >
            <ZoomIn size={16} />
          </button>
          <button
            onClick={() => setZoom(prev => Math.max(0.5, prev - 0.3))}
            className="w-9 h-9 rounded-lg bg-[#0a0e18]/70 backdrop-blur-sm border border-[#2a2d3a]/40
              flex items-center justify-center text-white/60 hover:text-white hover:bg-[#0a0e18]/90
              transition-all shadow-lg"
          >
            <ZoomOut size={16} />
          </button>
          <button
            onClick={centerOnPlayer}
            className="w-9 h-9 rounded-lg bg-[#0a0e18]/70 backdrop-blur-sm border border-[#2a2d3a]/40
              flex items-center justify-center text-white/60 hover:text-white hover:bg-[#0a0e18]/90
              transition-all shadow-lg"
          >
            <Crosshair size={16} />
          </button>
        </div>

        {/* Compass rose decoration */}
        <div className="absolute bottom-4 left-4 z-20 opacity-40 pointer-events-none">
          <svg width="64" height="64" viewBox="0 0 100 100">
            <g transform="translate(50,50)">
              {/* Main cardinal points */}
              <polygon points="0,-42 4,-12 -4,-12" fill="#c8a96e" />
              <polygon points="0,42 4,12 -4,12" fill="#8b7355" />
              <polygon points="-42,0 -12,4 -12,-4" fill="#8b7355" />
              <polygon points="42,0 12,4 12,-4" fill="#8b7355" />
              {/* Intercardinal points */}
              <polygon points="-30,-30 -6,-10 -10,-6" fill="#6b6355" opacity="0.6" />
              <polygon points="30,-30 6,-10 10,-6" fill="#6b6355" opacity="0.6" />
              <polygon points="-30,30 -6,10 -10,6" fill="#6b6355" opacity="0.6" />
              <polygon points="30,30 6,10 10,6" fill="#6b6355" opacity="0.6" />
              {/* Center */}
              <circle r="4" fill="#c8a96e" />
              <circle r="2" fill="#0a0e18" />
            </g>
            {/* Labels */}
            <text x="50" y="10" textAnchor="middle" fill="#c8a96e" fontSize="11" fontWeight="bold">N</text>
            <text x="50" y="97" textAnchor="middle" fill="#8b7355" fontSize="9">S</text>
            <text x="5" y="54" textAnchor="middle" fill="#8b7355" fontSize="9">W</text>
            <text x="95" y="54" textAnchor="middle" fill="#8b7355" fontSize="9">E</text>
          </svg>
        </div>

        {/* Hovered port tooltip */}
        {hoveredPort && (() => {
          const port = ports.find(p => p.id === hoveredPort);
          if (!port) return null;
          const dx = port.position[0] - playerPos[0];
          const dz = port.position[2] - playerPos[2];
          const dist = Math.round(Math.sqrt(dx * dx + dz * dz));
          const bearing = ((Math.atan2(dx, -dz) * 180 / Math.PI) + 360) % 360;
          const cardinals = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
          const cardinal = cardinals[Math.round(bearing / 22.5) % 16];
          return (
            <div className="absolute top-14 left-5 z-20 bg-[#0a0e18]/80 backdrop-blur-md border border-[#2a2d3a]/50 rounded-xl px-4 py-3 shadow-lg max-w-xs">
              <div className="text-amber-200 font-semibold text-sm">{port.name}</div>
              <div className="text-[#6a6d7a] text-xs mt-1">
                {port.scale} {port.culture} port
              </div>
              <div className="flex items-center gap-3 mt-1.5 pt-1.5 border-t border-white/5">
                <span className="text-amber-400/80 text-xs font-mono">{dist}u</span>
                <span className="text-[#6a6d7a] text-xs">bearing {Math.round(bearing)}° {cardinal}</span>
              </div>
            </div>
          );
        })()}

        {/* Subtle vignette */}
        <div className="absolute inset-0 pointer-events-none z-10 rounded-2xl"
          style={{
            boxShadow: 'inset 0 0 80px rgba(0,0,0,0.5), inset 0 0 20px rgba(0,0,0,0.3)',
          }}
        />

        {/* Subtle top/bottom gradient borders */}
        <div className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none z-10
          bg-gradient-to-t from-[#0a0e18]/60 to-transparent" />

        {/* Keyboard hints */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-4 text-[10px] text-white/25 pointer-events-none">
          <span>Drag to pan</span>
          <span>Scroll or +/- to zoom</span>
          <span>ESC to close</span>
        </div>
      </motion.div>
    </motion.div>
  );
}
