import { useEffect, useRef, useState, useCallback, useMemo, type ReactNode } from 'react';
import { useGameStore } from '../store/gameStore';
import { SEA_LEVEL } from '../constants/world';
import { getTerrainData, type TerrainData } from '../utils/terrain';
import { motion } from 'framer-motion';
import { X, Compass, ZoomIn, ZoomOut, Crosshair, Map as MapIcon } from 'lucide-react';
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
import { getPOIsForPort, resolvePOIPosition } from '../utils/poiDefinitions';

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
  onOpenWorldMap?: () => void;
}

const CHART = {
  oceanPanel: '#070b14',
  brass: '#c9a25a',
  brassBright: '#e2c87a',
  brassSoft: 'rgba(226,200,122,0.72)',
  player: '#94a8c4',
  landText: '#c8bfa8',
  mutedText: '#64748b',
  panel: 'rgba(8, 12, 20, 0.78)',
  panelLine: 'rgba(184,154,106,0.34)',
  poi: '#6dc3b0',
  scene: '#e8c872',
  grazer: '#c8a060',
  primate: '#8d6b52',
  reptile: '#78905a',
  bird: '#d8a0aa',
};

type AnimalLayer = {
  key: 'grazers' | 'primates' | 'reptiles' | 'wadingBirds';
  label: string;
  color: string;
  points: { position: [number, number, number] }[];
  speciesName?: string;
};

type AnimalCluster = {
  x: number;
  z: number;
  count: number;
  label: string;
  color: string;
};

const ANIMAL_CLUSTER_RADIUS = 34;
const ANIMAL_CLUSTER_SQ = ANIMAL_CLUSTER_RADIUS * ANIMAL_CLUSTER_RADIUS;

function clusterAnimalLayer(layer: AnimalLayer): AnimalCluster[] {
  const used = new Array(layer.points.length).fill(false);
  const clusters: AnimalCluster[] = [];
  for (let i = 0; i < layer.points.length; i++) {
    if (used[i]) continue;
    const origin = layer.points[i].position;
    let x = origin[0];
    let z = origin[2];
    let count = 1;
    used[i] = true;
    for (let j = i + 1; j < layer.points.length; j++) {
      if (used[j]) continue;
      const p = layer.points[j].position;
      const dx = p[0] - origin[0];
      const dz = p[2] - origin[2];
      if (dx * dx + dz * dz <= ANIMAL_CLUSTER_SQ) {
        used[j] = true;
        x += p[0];
        z += p[2];
        count++;
      }
    }
    const name = layer.speciesName ?? layer.label;
    clusters.push({
      x: x / count,
      z: z / count,
      count,
      label: count > 1 ? `${count} ${name}` : name,
      color: layer.color,
    });
  }
  return clusters;
}

function currentPortLabel(portName?: string) {
  return portName ? portName.toUpperCase() : 'LOCAL CHART';
}

export function WorldMap({ onClose, onOpenWorldMap }: WorldMapProps) {
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
  const discoveredPOIs = useGameStore(s => s.discoveredPOIs);
  const currentWorldPortId = useGameStore(s => s.currentWorldPortId);

  const currentPort = useMemo(() => {
    if (currentWorldPortId) {
      const exact = ports.find(p => p.id === currentWorldPortId);
      if (exact) return exact;
    }
    let nearest = ports[0];
    let nearestDistSq = Infinity;
    for (const port of ports) {
      const dx = port.position[0] - playerPos[0];
      const dz = port.position[2] - playerPos[2];
      const distSq = dx * dx + dz * dz;
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq;
        nearest = port;
      }
    }
    return nearest;
  }, [currentWorldPortId, playerPos, ports]);

  const animalLayers = useMemo<AnimalLayer[]>(() => {
    const animals = getAnimalMapData();
    const layers: AnimalLayer[] = [
      {
        key: 'grazers',
        label: 'Grazers',
        color: CHART.grazer,
        points: animals.grazers,
        speciesName: animals.grazerSpecies?.name,
      },
      {
        key: 'primates',
        label: 'Primates',
        color: CHART.primate,
        points: animals.primates,
        speciesName: animals.primateSpecies?.name,
      },
      {
        key: 'reptiles',
        label: 'Reptiles',
        color: CHART.reptile,
        points: animals.reptiles,
        speciesName: animals.reptileSpecies?.name,
      },
      {
        key: 'wadingBirds',
        label: 'Wading birds',
        color: CHART.bird,
        points: animals.wadingBirds,
        speciesName: animals.wadingSpecies?.name,
      },
    ];
    return layers.filter(layer => layer.points.length > 0);
  }, [worldSeed, ports]);

  const animalClusters = useMemo(
    () => animalLayers.flatMap(clusterAnimalLayer),
    [animalLayers],
  );

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

    // Draw animal markers — clustered labels at chart zoom, dots when pulled back.
    const animalOpacity = Math.min(1, Math.max(0, (zoom - 0.5) / 0.4));
    if (animalOpacity > 0.05) {
      const dotRadius = Math.max(0.8, 1.6 / zoom);
      ctx.globalAlpha = animalOpacity;
      for (const cluster of animalClusters) {
        const p = worldToCanvas(cluster.x, cluster.z);
        ctx.beginPath();
        ctx.arc(p.x, p.y, dotRadius + Math.min(2.5, cluster.count * 0.25) / zoom, 0, Math.PI * 2);
        ctx.fillStyle = cluster.color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(8,14,28,0.72)';
        ctx.lineWidth = 1 / zoom;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      if (zoom > 1.05) {
        ctx.font = `600 ${Math.max(8.5, 10.5 / zoom)}px "DM Sans", system-ui, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        for (const cluster of animalClusters) {
          if (cluster.count < 2 && zoom < 1.45) continue;
          const p = worldToCanvas(cluster.x, cluster.z);
          const label = cluster.label;
          const fs = Math.max(8.5, 10.5 / zoom);
          const lw = ctx.measureText(label).width;
          const lx = p.x + 5 / zoom;
          const ly = p.y - 7 / zoom;
          const pad = 2.5 / zoom;
          ctx.fillStyle = 'rgba(8, 12, 20, 0.74)';
          ctx.beginPath();
          ctx.roundRect(lx - pad, ly - fs / 2 - pad, lw + pad * 2, fs + pad * 2, 2.5 / zoom);
          ctx.fill();
          ctx.fillStyle = cluster.color;
          ctx.fillText(label, lx, ly);
        }
      }
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
          ctx.fillStyle = CHART.scene;
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
            ctx.fillStyle = CHART.brassBright;
            ctx.fillText(label, lx, ly);
          }
        }
      }
      ctx.globalAlpha = 1;
    }

    // Draw POIs — bright cyan circles for hand-authored sites attached to
    // discovered ports. Undiscovered POIs show "?" until the player has
    // opened the modal at least once. Always-visible (no zoom fade) since
    // there are far fewer POIs than hinterland scenes.
    for (const port of ports) {
      if (!discoveredPorts.includes(port.id)) continue;
      const pois = getPOIsForPort(port);
      for (const poi of pois) {
        const resolved = resolvePOIPosition(poi, port);
        if (!resolved) continue;
        const p = worldToCanvas(resolved.x, resolved.z);
        const r = 4 / zoom;
        const discovered = discoveredPOIs.includes(poi.id);

        // Soft halo
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.5);
        grad.addColorStop(0, 'rgba(95, 200, 255, 0.45)');
        grad.addColorStop(1, 'rgba(95, 200, 255, 0)');
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 3.5, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // Filled disc
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = CHART.poi;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 1.2 / zoom;
        ctx.stroke();

        // Label
        const showLabels = zoom > 0.9;
        if (showLabels) {
          const fs = Math.max(9, 11 / zoom);
          ctx.font = discovered
            ? `500 ${fs}px "Inter", system-ui, sans-serif`
            : `700 ${fs}px "Inter", system-ui, sans-serif`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          const label = discovered ? poi.name : '?';
          const lw = ctx.measureText(label).width;
          const lx = p.x + r + 5 / zoom;
          const ly = p.y;
          const pad = 2.5 / zoom;
          ctx.fillStyle = 'rgba(10, 14, 24, 0.6)';
          ctx.beginPath();
          ctx.roundRect(lx - pad, ly - fs / 2 - pad, lw + pad * 2, fs + pad * 2, 2 / zoom);
          ctx.fill();
          ctx.fillStyle = discovered ? '#d7f3ea' : CHART.poi;
          ctx.fillText(label, lx, ly);
        }
      }
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
        ctx.fillStyle = 'rgba(201, 162, 90, 0.22)';
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
      ctx.fillStyle = isHovered ? CHART.brassBright : CHART.brass;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,240,200,0.72)';
      ctx.lineWidth = 1.5 / zoom;
      ctx.stroke();

      // Inner highlight
      ctx.beginPath();
      ctx.arc(pos.x, pos.y - 1 / zoom, baseSize * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fill();

      // Port name
      const fontSize = Math.max(10, 13 / zoom);
      ctx.font = `600 ${fontSize}px "Fraunces", serif`;
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

      ctx.fillStyle = '#f0dfb8';
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
  }, [zoom, offset, hoveredPort, playerPos, playerRot, playerMode, ports, discoveredPorts, discoveredPOIs, mapWorldHalf, worldSeed, animalClusters]);

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

  const hoveredPortInfo = hoveredPort ? ports.find(p => p.id === hoveredPort) : null;
  const hoveredBearing = hoveredPortInfo ? (() => {
    const dx = hoveredPortInfo.position[0] - playerPos[0];
    const dz = hoveredPortInfo.position[2] - playerPos[2];
    const bearing = ((Math.atan2(dx, -dz) * 180 / Math.PI) + 360) % 360;
    const dist = Math.round(Math.sqrt(dx * dx + dz * dz));
    const cardinals = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return { dist, bearing: Math.round(bearing), cardinal: cardinals[Math.round(bearing / 22.5) % 16] };
  })() : null;

  return (
    <motion.div
      {...modalBackdropMotion}
      className="absolute inset-0 bg-black/65 backdrop-blur-sm pointer-events-auto flex items-center justify-center z-40 p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        data-testid="local-map-modal"
        {...modalPanelMotion}
        className="relative w-full h-[var(--app-height)] sm:h-[82vh] sm:max-w-6xl sm:rounded-[18px] overflow-hidden"
        style={{
          padding: 7,
          background: 'radial-gradient(ellipse at 22% 12%, #d4b16a 0%, #a78845 22%, #6b4f22 48%, #2c1f0c 100%)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.75), inset 0 2px 3px rgba(255,225,160,0.35), inset 0 -2px 4px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.4)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="relative w-full h-full overflow-hidden sm:rounded-[12px] grid grid-rows-[minmax(0,1fr)_minmax(190px,42%)] md:grid-rows-1 md:grid-cols-[minmax(0,1fr)_18rem]"
          style={{
            background: CHART.oceanPanel,
            boxShadow: 'inset 0 0 0 1px #b89a6a, inset 0 0 0 2px rgba(0,0,0,0.5), inset 0 4px 12px rgba(0,0,0,0.7)',
          }}
        >
          <div ref={containerRef} className="relative min-h-0 min-w-0">
            <div className="absolute top-0 left-0 right-0 z-20 px-4 pt-3 pb-3 bg-gradient-to-b from-[#070b14]/95 to-transparent">
              <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-amber-500/70">
                    <Compass size={13} />
                    Local Chart
                  </div>
                </div>
                <div className="text-center min-w-0">
                  <div
                    className="text-amber-200 text-base sm:text-lg truncate"
                    style={{ fontFamily: '"Fraunces", serif', fontWeight: 600, letterSpacing: '0.08em' }}
                  >
                    {currentPortLabel(currentPort?.name)}
                  </div>
                  <div className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                    {currentPort ? `${currentPort.scale} ${currentPort.culture} harbor` : 'Harbor vicinity'} · {discoveredPorts.length}/{ports.length} ports known
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  {onOpenWorldMap && (
                    <button
                      data-testid="local-map-world-map"
                      aria-label="Open world map"
                      onClick={onOpenWorldMap}
                      className="h-8 px-3 rounded-md border border-amber-400/25 bg-amber-500/[0.08] text-amber-200/90 hover:bg-amber-500/[0.14] transition-colors flex items-center gap-2 text-[11px] uppercase tracking-[0.12em]"
                    >
                      <MapIcon size={13} />
                      <span className="hidden sm:inline">World Map</span>
                    </button>
                  )}
                  <button
                    onClick={onClose}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90"
                    style={{
                      background: 'radial-gradient(circle at 30% 25%, #d8b46a 0%, #a08548 35%, #5c4320 75%, #291c08 100%)',
                      boxShadow: 'inset 0 1px 1.5px rgba(255,225,160,0.4), inset 0 -1px 2px rgba(0,0,0,0.6), 0 1px 3px rgba(0,0,0,0.6)',
                    }}
                    title="Close"
                  >
                    <X size={13} className="text-[#2a1f0c]" strokeWidth={3} />
                  </button>
                </div>
              </div>
            </div>

            <canvas
              ref={canvasRef}
              className={`w-full h-full ${dragging ? 'cursor-grabbing' : hoveredPort ? 'cursor-pointer' : 'cursor-grab'}`}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
              onWheel={handleWheel}
            />

            {isRendering && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#070b14]/92 z-30 pointer-events-none">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                  <span className="text-amber-200/70 text-sm">Rendering local chart...</span>
                </div>
              </div>
            )}

            <div className="absolute right-4 bottom-4 z-20 flex flex-col gap-1.5">
              <ChartIconButton label="Zoom in" onClick={() => setZoom(prev => Math.min(4, prev + 0.3))}><ZoomIn size={16} /></ChartIconButton>
              <ChartIconButton label="Zoom out" onClick={() => setZoom(prev => Math.max(0.5, prev - 0.3))}><ZoomOut size={16} /></ChartIconButton>
              <ChartIconButton label="Center" onClick={centerOnPlayer}><Crosshair size={16} /></ChartIconButton>
            </div>

            {hoveredTerrainLabel && !isRendering && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none rounded-md px-3 py-1 shadow-lg"
                style={{ background: CHART.panel, border: `1px solid ${CHART.panelLine}` }}>
                <span className="text-[11px] font-semibold tracking-wide text-amber-100/90">
                  {hoveredTerrainLabel}
                </span>
              </div>
            )}

            <div className="absolute inset-0 pointer-events-none z-10"
              style={{ boxShadow: 'inset 0 0 70px rgba(20,10,0,0.48)' }}
            />
          </div>

          <div
            aria-hidden
            className="hidden"
            style={{ background: 'linear-gradient(to bottom, transparent 0%, rgba(201,162,90,0.55) 50%, transparent 100%)' }}
          />

          <aside className="min-h-0 min-w-0 bg-[#080c14]/78 border-t md:border-t-0 md:border-l border-[#3a3020]/60 flex flex-col">
            <div className="px-4 pt-3.5 pb-3 border-b border-[#2a2520]/60">
              <div className="text-center text-amber-400/90 uppercase"
                style={{ fontFamily: '"Fraunces", serif', fontSize: 11, letterSpacing: '0.28em', fontWeight: 500 }}>
                Harbor Detail
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <MiniStat label="Zoom" value={`${zoom.toFixed(1)}x`} />
                <MiniStat label="POIs" value={String(discoveredPOIs.length)} />
                <MiniStat label="Wildlife" value={String(animalClusters.length)} />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
              <section>
                <div className="text-[10px] uppercase tracking-[0.2em] text-amber-500/70 mb-2">Selected</div>
                {hoveredPortInfo && hoveredBearing ? (
                  <div className="rounded-md px-3 py-2" style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div className="text-sm text-amber-100" style={{ fontFamily: '"Fraunces", serif' }}>{hoveredPortInfo.name}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{hoveredPortInfo.scale} {hoveredPortInfo.culture} port</div>
                    <div className="mt-2 flex gap-3 text-[11px]">
                      <span className="text-amber-300 tabular-nums">{hoveredBearing.dist}u</span>
                      <span className="text-slate-400">bearing {hoveredBearing.bearing}° {hoveredBearing.cardinal}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-500 leading-snug">Hover a port or marker on the chart. Terrain appears along the lower edge.</div>
                )}
              </section>

              <section>
                <div className="text-[10px] uppercase tracking-[0.2em] text-amber-500/70 mb-2">Legend</div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] text-slate-300">
                  <LegendItem color={CHART.player} label="You" shape="arrow" />
                  <LegendItem color={CHART.brass} label="Port" />
                  <LegendItem color={CHART.poi} label="POI" />
                  <LegendItem color={CHART.scene} label="Scene" shape="diamond" />
                </div>
              </section>

              <section>
                <div className="text-[10px] uppercase tracking-[0.2em] text-amber-500/70 mb-2">Animals</div>
                {animalLayers.length > 0 ? (
                  <div className="space-y-1.5">
                    {animalLayers.map(layer => (
                      <div key={layer.key} className="flex items-center gap-2 text-[11px]">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: layer.color }} />
                        <span className="text-slate-300 truncate">{layer.speciesName ?? layer.label}</span>
                        <span className="ml-auto text-slate-500 tabular-nums">{layer.points.length}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-500">No wildlife markers in this loaded scene.</div>
                )}
              </section>

              <section className="hidden md:block">
                <div className="text-[10px] uppercase tracking-[0.2em] text-amber-500/70 mb-2">Controls</div>
                <div className="text-[11px] text-slate-500 leading-relaxed">
                  Drag to pan. Scroll or use the buttons to zoom. Press Escape to close.
                </div>
              </section>
            </div>
          </aside>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ChartIconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="w-9 h-9 rounded-md flex items-center justify-center text-amber-100/75 hover:text-amber-100 transition-colors shadow-lg"
      style={{ background: CHART.panel, border: `1px solid ${CHART.panelLine}` }}
    >
      {children}
    </button>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md py-1.5" style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="text-[13px] text-amber-100 tabular-nums">{value}</div>
      <div className="text-[8px] uppercase tracking-[0.16em] text-slate-500">{label}</div>
    </div>
  );
}

function LegendItem({ color, label, shape = 'dot' }: { color: string; label: string; shape?: 'dot' | 'diamond' | 'arrow' }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={shape === 'diamond' ? 'w-2.5 h-2.5 rotate-45' : shape === 'arrow' ? 'w-0 h-0 border-y-[5px] border-y-transparent border-l-[9px]' : 'w-2.5 h-2.5 rounded-full'}
        style={shape === 'arrow' ? { borderLeftColor: color } : { backgroundColor: color }}
      />
      <span>{label}</span>
    </div>
  );
}
