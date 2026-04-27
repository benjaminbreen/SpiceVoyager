import { useEffect, useRef, useState, useCallback } from 'react';
import { useGameStore } from '../store/gameStore';
import { SEA_LEVEL } from '../constants/world';
import { getTerrainData, type TerrainData } from '../utils/terrain';
import { motion } from 'framer-motion';
import { X, Compass, ZoomIn, ZoomOut, Crosshair } from 'lucide-react';
import { resolveWaterPaletteId } from '../utils/waterPalettes';
import { modalBackdropMotion, modalPanelMotion } from '../utils/uiMotion';
import { getAnimalMapData } from '../state/worldRegistries';
import {
  getTerrainMapCanvas,
  getTerrainMapWorldHalf,
  isTerrainMapReady,
  onTerrainReady,
  startTerrainPreRender,
} from '../utils/worldMapTerrainCache';
import {
  placeHinterlandScenes,
  getSceneLabel,
  SceneInstance,
} from '../utils/hinterlandScenes';

const WORLD_HALF = 550;

function terrainHoverLabel(terrain: TerrainData): string {
  if (terrain.biome === 'lagoon') return 'Lagoon';
  if (terrain.height < SEA_LEVEL) {
    if (terrain.reefFactor > 0.24) return 'Coral reef';
    if (terrain.surfFactor > 0.45) return 'Surf';
    if (terrain.shallowFactor > 0.28) return 'Shallow water';
    return 'Deep water';
  }

  switch (terrain.biome) {
    case 'mangrove': return 'Mangrove';
    case 'tidal_flat': return 'Tidal flat';
    case 'rocky_shore': return 'Rocky shore';
    case 'beach': return 'Beach';
    case 'desert': return 'Desert';
    case 'scrubland': return 'Scrubland';
    case 'paddy': return 'Paddy field';
    case 'swamp': return 'Swamp';
    case 'grassland': return 'Grassland';
    case 'forest': return 'Forest';
    case 'jungle': return 'Jungle';
    case 'arroyo': return 'Arroyo';
    case 'snow': return 'Snowfield';
    case 'volcano': return 'Volcanic slope';
    case 'river': return 'River';
    case 'waterfall': return 'Waterfall';
    default: return 'Terrain';
  }
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
  const [hoveredTerrainLabel, setHoveredTerrainLabel] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(!getTerrainMapCanvas());
  const [mapWorldHalf, setMapWorldHalf] = useState(getTerrainMapWorldHalf());
  const containerRef = useRef<HTMLDivElement>(null);
  const didSetInitialOffsetRef = useRef(false);

  // Scene placement is pure & deterministic but non-trivial (~80 sample points
  // per scene def per port). Cache per portId so we only compute each port once.
  const sceneCache = useRef<Map<string, SceneInstance[]>>(new Map());
  const waterPaletteId = useGameStore((state) => resolveWaterPaletteId(state));

  const playerPos = useGameStore(s => s.playerPos);
  const ports = useGameStore(s => s.ports);
  const discoveredPorts = useGameStore(s => s.discoveredPorts);
  const playerRot = useGameStore(s => s.playerRot);
  const playerMode = useGameStore(s => s.playerMode);
  const worldSeed = useGameStore(s => s.worldSeed);

  // Wait for the module-level pre-render (usually already done by the time modal opens)
  useEffect(() => {
    if (isTerrainMapReady(waterPaletteId)) {
      setMapWorldHalf(getTerrainMapWorldHalf());
      setIsRendering(false);
      return;
    }
    let active = true;
    setIsRendering(true);
    startTerrainPreRender(waterPaletteId);
    onTerrainReady(() => {
      if (!active) return;
      setMapWorldHalf(getTerrainMapWorldHalf());
      setIsRendering(false);
    });
    return () => { active = false; };
  }, [waterPaletteId]);

  // Center on player initially
  useEffect(() => {
    if (isRendering) return;
    if (didSetInitialOffsetRef.current) return;
    didSetInitialOffsetRef.current = true;
    setOffset({
      x: -(playerPos[0] / mapWorldHalf) * 0.5,
      y: -(playerPos[2] / mapWorldHalf) * 0.5,
    });
  }, [isRendering, mapWorldHalf, playerPos]);

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
    const terrainCanvas = getTerrainMapCanvas();
    if (!canvas || !terrainCanvas || !container) return;
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
    ctx.drawImage(terrainCanvas, -w / 2, -h / 2, w, h);

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
      x: (wx / mapWorldHalf) * (w / 2),
      y: (wz / mapWorldHalf) * (h / 2),
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

    // Draw animal markers — tiny dots colored by template, faded at very low zoom
    const animals = getAnimalMapData();
    const animalOpacity = Math.min(1, Math.max(0, (zoom - 0.5) / 0.4));
    if (animalOpacity > 0.05) {
      const dotRadius = Math.max(0.8, 1.6 / zoom);
      const drawLayer = (entries: { position: [number, number, number] }[], fill: string) => {
        if (!entries || entries.length === 0) return;
        ctx.fillStyle = fill;
        for (const a of entries) {
          const p = worldToCanvas(a.position[0], a.position[2]);
          ctx.beginPath();
          ctx.arc(p.x, p.y, dotRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      };
      ctx.globalAlpha = animalOpacity;
      drawLayer(animals.grazers, '#c8a060');       // tan — grazers/camels/deer
      drawLayer(animals.primates, '#5a3a28');      // dark brown — primates
      drawLayer(animals.reptiles, '#6a8048');      // olive — reptiles
      drawLayer(animals.wadingBirds, '#f0b8c0');   // soft pink — wading birds
      ctx.globalAlpha = 1;
    }

    // Draw hinterland scenes — amber diamonds for each scene in a discovered
    // port's outer ring. Fade out at low zoom to avoid clutter.
    const sceneOpacity = Math.min(1, Math.max(0, (zoom - 0.7) / 0.5));
    if (sceneOpacity > 0.05) {
      ctx.globalAlpha = sceneOpacity;
      const showLabels = zoom > 1.3;
      for (const port of ports) {
        if (!discoveredPorts.includes(port.id)) continue;
        const cacheKey = `${port.id}|${worldSeed}`;
        let scenes = sceneCache.current.get(cacheKey);
        if (!scenes) {
          scenes = placeHinterlandScenes(
            port.position[0], port.position[2],
            port.culture, port.buildings, worldSeed,
          );
          sceneCache.current.set(cacheKey, scenes);
        }
        for (const scene of scenes) {
          const p = worldToCanvas(scene.x, scene.z);
          const half = 3 / zoom;

          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(Math.PI / 4);
          ctx.fillStyle = '#f2b840';
          ctx.strokeStyle = 'rgba(255,255,255,0.85)';
          ctx.lineWidth = 1 / zoom;
          ctx.beginPath();
          ctx.rect(-half, -half, half * 2, half * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();

          if (showLabels) {
            const fs = Math.max(8, 10 / zoom);
            ctx.font = `500 ${fs}px "Inter", system-ui, sans-serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            const label = getSceneLabel(scene.kind);
            const lw = ctx.measureText(label).width;
            const lx = p.x + half + 4 / zoom;
            const ly = p.y;
            const pad = 2 / zoom;
            ctx.fillStyle = 'rgba(10, 14, 24, 0.55)';
            ctx.beginPath();
            ctx.roundRect(lx - pad, ly - fs / 2 - pad, lw + pad * 2, fs + pad * 2, 2 / zoom);
            ctx.fill();
            ctx.fillStyle = '#f2d890';
            ctx.fillText(label, lx, ly);
          }
        }
      }
      ctx.globalAlpha = 1;
    }

    // Draw ports
    ports.forEach(port => {
      const isDiscovered = discoveredPorts.includes(port.id);
      const pos = worldToCanvas(port.position[0], port.position[2]);
      const isHovered = hoveredPort === port.id;
      const scaleMap: Record<string, number> = { 'Small': 4, 'Medium': 5, 'Large': 6, 'Very Large': 7, 'Huge': 8 };
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

    // Ring around player
    const pulseRadius = 14 / zoom;
    ctx.beginPath();
    ctx.arc(pp.x, pp.y, pulseRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(100, 180, 255, 0.45)';
    ctx.lineWidth = 1.5 / zoom;
    ctx.stroke();

    ctx.restore();
  }, [zoom, offset, hoveredPort, playerPos, playerRot, playerMode, ports, discoveredPorts, mapWorldHalf, worldSeed]);

  useEffect(() => {
    if (isRendering) return;
    draw();
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
    const worldX = (cx / (w / 2)) * mapWorldHalf;
    const worldZ = (cy / (h / 2)) * mapWorldHalf;
    const terrainLabel = terrainHoverLabel(getTerrainData(worldX, worldZ));
    setHoveredTerrainLabel(prev => prev === terrainLabel ? prev : terrainLabel);

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
  const handleMouseLeave = () => {
    setDragging(false);
    setHoveredPort(null);
    setHoveredTerrainLabel(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setZoom(prev => Math.max(0.5, Math.min(4, prev + delta)));
  };

  const centerOnPlayer = () => {
    setOffset({
      x: -(playerPos[0] / mapWorldHalf) * 0.5,
      y: -(playerPos[2] / mapWorldHalf) * 0.5,
    });
    setZoom(1.5);
  };

  return (
    <motion.div
      {...modalBackdropMotion}
      className="absolute inset-0 bg-black/70 backdrop-blur-sm pointer-events-auto flex items-center justify-center p-6 z-40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        ref={containerRef}
        {...modalPanelMotion}
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
          onMouseLeave={handleMouseLeave}
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

        {/* Wildlife legend (bottom-left) — only when species are actually spawned on this map */}
        {(() => {
          const a = getAnimalMapData();
          const items: { color: string; info?: { name: string } }[] = [];
          if (a.grazers.length > 0 && a.grazerSpecies) items.push({ color: '#c8a060', info: a.grazerSpecies });
          if (a.primates.length > 0 && a.primateSpecies) items.push({ color: '#5a3a28', info: a.primateSpecies });
          if (a.reptiles.length > 0 && a.reptileSpecies) items.push({ color: '#6a8048', info: a.reptileSpecies });
          if (a.wadingBirds.length > 0 && a.wadingSpecies) items.push({ color: '#f0b8c0', info: a.wadingSpecies });
          if (items.length === 0) return null;
          return (
            <div className="absolute bottom-5 left-5 z-20 bg-[#0a0e18]/80 backdrop-blur-md border border-[#2a2d3a]/50 rounded-xl px-3 py-2 shadow-lg">
              <div className="text-[10px] uppercase tracking-wider text-[#8a8060] font-semibold mb-1.5">Wildlife</div>
              <div className="flex flex-col gap-1">
                {items.map((it, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: it.color }} />
                    <span className="text-[11px] text-[#c8bfa8]">{it.info?.name ?? '—'}</span>
                  </div>
                ))}
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

        {/* Hovered terrain label */}
        {hoveredTerrainLabel && !isRendering && (
          <div className="absolute bottom-9 left-1/2 -translate-x-1/2 z-20 pointer-events-none
            rounded-md border border-[#2a2d3a]/60 bg-[#0a0e18]/75 backdrop-blur-md
            px-3 py-1 shadow-lg">
            <span className="text-[11px] font-semibold tracking-wide text-amber-100/90">
              {hoveredTerrainLabel}
            </span>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
