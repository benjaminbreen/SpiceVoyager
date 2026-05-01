import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useGameStore } from '../store/gameStore';
import { motion, AnimatePresence } from 'framer-motion';
import { sfxSail, sfxClose, sfxClick, sfxHover } from '../audio/SoundEffects';
import { X, Navigation, Anchor, Clock, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import * as d3 from 'd3';
import { feature } from 'topojson-client';
import type { Topology, Objects } from 'topojson-specification';
import {
  canDirectlySail,
  getReachableWorldPortIds,
  WORLD_PORT_COORDS,
  WORLD_PORTS,
  estimateSeaTravel,
  getWorldPortById,
  resolveCampaignPortId,
  getAllSeaLaneEdges,
  getSeaLaneWaypoints,
  getPortRegion,
  REGION_VIEWS,
  REGION_LABELS,
  PORT_REGIONS,
  type WorldRegion,
} from '../utils/worldPorts';
import VoyageModal from './VoyageModal';
import { resolveVoyage, type VoyageResolution } from '../utils/voyageResolution';
import { modalBackdropMotion, modalContentMotion, modalPanelMotion } from '../utils/uiMotion';

interface WorldMapModalProps {
  onClose: () => void;
  onArrival?: (portName: string, swap: () => void) => Promise<void>;
}

/** Group ports by region, sorted with the player's region first */
function groupPortsByRegion(
  ports: typeof WORLD_PORTS,
  playerRegion: WorldRegion
): { region: WorldRegion; label: string; ports: typeof WORLD_PORTS }[] {
  const groups = new Map<WorldRegion, typeof WORLD_PORTS>();
  for (const port of ports) {
    const list = groups.get(port.region) ?? [];
    list.push(port);
    groups.set(port.region, list);
  }
  const regionOrder: WorldRegion[] = ['europe', 'westAfrica', 'eastAfrica', 'indianOcean', 'eastIndies', 'atlantic'];
  // Put player's region first
  const sorted = [playerRegion, ...regionOrder.filter(r => r !== playerRegion)];
  return sorted
    .filter(r => groups.has(r))
    .map(r => ({ region: r, label: REGION_LABELS[r], ports: groups.get(r)! }));
}

const REGION_NAV_ORDER: (WorldRegion | 'world')[] = ['world', 'europe', 'eastAfrica', 'indianOcean', 'eastIndies', 'atlantic'];
const REGION_NAV_LABELS: Record<string, string> = {
  world: 'World',
  europe: 'Europe',
  eastAfrica: 'E. Africa',
  indianOcean: 'Ind. Ocean',
  eastIndies: 'E. Indies',
  atlantic: 'Atlantic',
};

const VOYAGE_INCIDENT_CHANCE = 0.25;

type TravelModalState = {
  fromPort: string;
  toPort: string;
  totalDays: number;
  targetPortId: string;
  fromPortId: string;
  toPortId: string;
  force: boolean;
};

export function WorldMapModal({ onClose, onArrival }: WorldMapModalProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [hoveredPort, setHoveredPort] = useState<string | null>(null);
  const [selectedPort, setSelectedPort] = useState<string | null>(null);
  const [topoData, setTopoData] = useState<any>(null);
  const [activeRegion, setActiveRegion] = useState<WorldRegion | 'world'>('world');
  const [expandedRegions, setExpandedRegions] = useState<Set<WorldRegion>>(new Set());
  const [devMode, setDevMode] = useState(false);

  const dayCount = useGameStore(s => s.dayCount);
  const fastTravel = useGameStore(s => s.fastTravel);
  const crew = useGameStore(s => s.crew);
  const stats = useGameStore(s => s.stats);
  const provisions = useGameStore(s => s.provisions);
  const weather = useGameStore(s => s.weather);
  const windSpeed = useGameStore(s => s.windSpeed);
  const chartedRoutes = useGameStore(s => s.chartedRoutes);
  const worldSeed = useGameStore(s => s.worldSeed);
  const devSoloPort = useGameStore(s => s.devSoloPort);
  const currentWorldPortId = useGameStore(s => s.currentWorldPortId);
  const worldPorts = WORLD_PORTS;
  const nearestPortId = resolveCampaignPortId({ worldSeed, devSoloPort, currentWorldPortId });
  const playerRegion = getPortRegion(nearestPortId);
  const reachablePortIds = useMemo(() => getReachableWorldPortIds(nearestPortId), [nearestPortId]);
  const seaLaneEdges = useMemo(() => getAllSeaLaneEdges(), []);

  const [travelModal, setTravelModal] = useState<TravelModalState | null>(null);

  // Calculate travel info for selected port
  const travelInfo = useMemo(() => {
    if (!selectedPort || selectedPort === nearestPortId) return null;
    if (!devMode && !canDirectlySail(nearestPortId, selectedPort)) return null;
    const port = getWorldPortById(selectedPort);
    const voyage = estimateSeaTravel(nearestPortId, selectedPort);
    if (!port || !voyage) return null;
    return { ...voyage, port };
  }, [selectedPort, nearestPortId, devMode]);

  // Initialize expanded regions — player's region starts expanded
  useEffect(() => {
    setExpandedRegions(new Set([playerRegion]));
  }, [playerRegion]);

  useEffect(() => {
    if (devMode) return;
    setSelectedPort((current) => {
      if (current === nearestPortId) return current;
      if (current && canDirectlySail(nearestPortId, current)) return current;
      return nearestPortId;
    });
  }, [nearestPortId, reachablePortIds, devMode]);

  // Load TopoJSON
  useEffect(() => {
    fetch('/countries-110m.json')
      .then(r => r.json())
      .then(setTopoData)
      .catch(() => {});
  }, []);

  // Build base projection (wide enough for Lisbon → Macau)
  const getBaseProjection = useCallback((width: number, height: number) => {
    return d3.geoMercator()
      .center([30, 10])
      .scale(Math.min(width, height) * 0.35)
      .translate([width / 2, height / 2]);
  }, []);

  /** Compute a d3 zoom transform that shows a given region view */
  const getRegionTransform = useCallback((
    regionKey: WorldRegion | 'world',
    width: number,
    height: number
  ) => {
    const baseProj = getBaseProjection(width, height);
    const view = REGION_VIEWS[regionKey];
    const baseScale = Math.min(width, height) * 0.35;
    const targetScale = Math.min(width, height) * view.scale;
    const k = targetScale / baseScale;

    // Project the desired center, figure out how to translate so it lands at viewport center
    const projected = baseProj(view.center);
    if (!projected) return d3.zoomIdentity;
    const tx = width / 2 - projected[0] * k;
    const ty = height / 2 - projected[1] * k;
    return d3.zoomIdentity.translate(tx, ty).scale(k);
  }, [getBaseProjection]);

  // Navigate to region
  const navigateToRegion = useCallback((regionKey: WorldRegion | 'world') => {
    if (!svgRef.current || !zoomRef.current) return;
    const svg = d3.select(svgRef.current);
    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;
    const transform = getRegionTransform(regionKey, width, height);
    svg.transition().duration(750).call(zoomRef.current.transform as any, transform);
    setActiveRegion(regionKey);
  }, [getRegionTransform]);

  // Render D3 map
  useEffect(() => {
    if (!svgRef.current || !topoData) return;

    const svg = d3.select(svgRef.current);
    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    svg.selectAll('*').remove();

    const projection = getBaseProjection(width, height);
    const path = d3.geoPath().projection(projection);

    const countries = feature(
      topoData as Topology<Objects>,
      topoData.objects.countries
    );

    // Ocean background
    svg.append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', '#0c1222');

    // SVG animation definitions
    const defs = svg.append('defs');
    // Marching dashes on selected route
    defs.append('style').text(`
      @keyframes dash-march {
        to { stroke-dashoffset: -20; }
      }
      .route-selected {
        animation: dash-march 1.5s linear infinite;
      }
      @keyframes pulse-glow {
        0%, 100% { opacity: 0.4; }
        50% { opacity: 0.7; }
      }
      .port-glow {
        animation: pulse-glow 2s ease-in-out infinite;
      }
      @keyframes spin-ring {
        to { transform-origin: center; }
      }
      .port-player-ring {
        animation: dash-march 8s linear infinite;
      }
    `);

    // Main content group — all map elements go here, zoom transforms this group
    const g = svg.append('g').attr('class', 'map-content');

    // Graticule
    const graticule = d3.geoGraticule().step([15, 15]);
    g.append('path')
      .datum(graticule())
      .attr('d', path as any)
      .attr('fill', 'none')
      .attr('stroke', 'rgba(255,255,255,0.04)')
      .attr('stroke-width', 0.5);

    // Landmasses
    g.selectAll('.country')
      .data((countries as any).features)
      .enter()
      .append('path')
      .attr('d', path as any)
      .attr('fill', '#1a2035')
      .attr('stroke', 'rgba(255,255,255,0.08)')
      .attr('stroke-width', 0.5);

    // Sea lane edges — curved lines routed around landmasses via waypoints
    const seaLaneGroup = g.append('g').attr('class', 'sea-lanes');
    const lineGen = d3.line<[number, number]>()
      .x(d => d[0])
      .y(d => d[1])
      .curve(d3.curveCatmullRom.alpha(0.5));

    seaLaneEdges.forEach(([fromId, toId]) => {
      const fromCoords = WORLD_PORT_COORDS[fromId];
      const toCoords = WORLD_PORT_COORDS[toId];
      if (!fromCoords || !toCoords) return;
      const from = projection(fromCoords);
      const to = projection(toCoords);
      if (!from || !to) return;

      const isSelectedRoute =
        (fromId === nearestPortId && toId === selectedPort) ||
        (toId === nearestPortId && fromId === selectedPort);

      // Build point list: start → waypoints → end
      const waypoints = getSeaLaneWaypoints(fromId, toId);
      const projectedPoints: [number, number][] = [from as [number, number]];
      for (const wp of waypoints) {
        const p = projection(wp);
        if (p) projectedPoints.push(p as [number, number]);
      }
      projectedPoints.push(to as [number, number]);

      const pathD = lineGen(projectedPoints);
      if (!pathD) return;

      seaLaneGroup.append('path')
        .attr('class', isSelectedRoute ? 'route-selected sea-lane' : 'sea-lane')
        .attr('d', pathD)
        .attr('fill', 'none')
        .attr('stroke', isSelectedRoute ? 'rgba(251,191,36,0.5)' : 'rgba(255,255,255,0.06)')
        .attr('stroke-width', isSelectedRoute ? 1.8 : 0.8)
        .attr('stroke-dasharray', isSelectedRoute ? '6,4' : 'none');

      // Day count label at midpoint of selected route
      if (isSelectedRoute) {
        const travel = estimateSeaTravel(fromId, toId);
        if (travel) {
          // Find the visual midpoint of the path
          const midIdx = Math.floor(projectedPoints.length / 2);
          const midPt = projectedPoints[midIdx];
          // Offset slightly above the line
          seaLaneGroup.append('text')
            .attr('class', 'route-days-label')
            .attr('x', midPt[0])
            .attr('y', midPt[1] - 8)
            .attr('text-anchor', 'middle')
            .attr('fill', 'rgba(251,191,36,0.7)')
            .attr('font-size', '9px')
            .attr('font-weight', '700')
            .attr('font-family', '"Inter", system-ui, sans-serif')
            .text(`${travel.days}d`);
        }
      }
    });

    // Port markers group
    const portGroup = g.append('g').attr('class', 'ports');

    worldPorts.forEach(port => {
      const projected = projection(port.coords);
      if (!projected) return;

      const isSelected = selectedPort === port.id;
      const isPlayer = port.id === nearestPortId;
      const isReachable = reachablePortIds.includes(port.id);
      const isInteractive = devMode || isPlayer || isReachable;

      const portG = portGroup.append('g')
        .attr('class', `port-${port.id}`)
        .attr('cursor', isInteractive ? 'pointer' : 'default')
        .on('mouseenter', () => setHoveredPort(port.id))
        .on('mouseleave', () => setHoveredPort(null))
        .on('click', () => {
          if (!isInteractive) return;
          setSelectedPort(port.id === selectedPort ? null : port.id);
        });

      // Glow ring for selected (pulsing animation via CSS)
      if (isSelected) {
        portG.append('circle')
          .attr('class', 'port-glow')
          .attr('cx', projected[0]).attr('cy', projected[1])
          .attr('r', 12)
          .attr('fill', 'none')
          .attr('stroke', 'rgba(251,191,36,0.4)')
          .attr('stroke-width', 2);
      }

      // Player location indicator (slow spinning dash animation via CSS)
      if (isPlayer) {
        portG.append('circle')
          .attr('class', 'port-player-ring')
          .attr('cx', projected[0]).attr('cy', projected[1])
          .attr('r', 10)
          .attr('fill', 'none')
          .attr('stroke', 'rgba(96,165,250,0.5)')
          .attr('stroke-width', 1.5)
          .attr('stroke-dasharray', '3,3');
      }

      // Port marker — shape varies by scale
      const dotColor = isPlayer ? '#60a5fa' : isSelected ? '#fbbf24' : (isReachable || devMode) ? '#e2c87a' : 'rgba(148,163,184,0.4)';
      const strokeColor = isInteractive ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.12)';

      if (port.scale === 'Huge' || port.scale === 'Very Large') {
        // Very Large: filled dot + outer ring (double indicator)
        const outerR = 7;
        const innerR = 3.5;
        portG.append('circle')
          .attr('class', 'port-dot')
          .attr('cx', projected[0]).attr('cy', projected[1])
          .attr('r', outerR)
          .attr('data-r', outerR)
          .attr('fill', 'none')
          .attr('stroke', dotColor)
          .attr('stroke-width', 1.2);
        portG.append('circle')
          .attr('class', 'port-dot')
          .attr('cx', projected[0]).attr('cy', projected[1])
          .attr('r', innerR)
          .attr('data-r', innerR)
          .attr('fill', dotColor)
          .attr('stroke', strokeColor)
          .attr('stroke-width', 0.8);
      } else if (port.scale === 'Large') {
        // Large: filled dot with visible outer stroke
        const r = isPlayer ? 4.5 : isSelected ? 5.5 : 4.5;
        portG.append('circle')
          .attr('class', 'port-dot')
          .attr('cx', projected[0]).attr('cy', projected[1])
          .attr('r', r)
          .attr('data-r', r)
          .attr('fill', dotColor)
          .attr('stroke', strokeColor)
          .attr('stroke-width', 1.5);
      } else {
        // Medium / Small: simple dot
        const r = port.scale === 'Medium' ? 3.2 : 2.5;
        const finalR = isSelected ? r + 1 : r;
        portG.append('circle')
          .attr('class', 'port-dot')
          .attr('cx', projected[0]).attr('cy', projected[1])
          .attr('r', finalR)
          .attr('data-r', finalR)
          .attr('fill', dotColor)
          .attr('stroke', strokeColor)
          .attr('stroke-width', 0.8);
      }

      // Label — font-size and offset are counter-scaled in the zoom handler
      const isLarge = port.scale === 'Large' || port.scale === 'Very Large' || port.scale === 'Huge';
      portG.append('text')
        .attr('class', `port-label ${isLarge || isPlayer ? 'major' : 'minor'}`)
        .attr('data-x', projected[0])
        .attr('data-y', projected[1])
        .attr('x', projected[0] + 10)
        .attr('y', projected[1] + 4)
        .attr('fill', isPlayer ? '#93bbfc' : isSelected ? '#fbbf24' : (isReachable || devMode) ? 'rgba(226,200,122,0.7)' : 'rgba(148,163,184,0.42)')
        .attr('font-size', '11px')
        .attr('font-weight', '600')
        .attr('letter-spacing', '0.01em')
        .attr('font-family', '"Inter", system-ui, sans-serif')
        .text(port.name);
    });

    // Set up zoom behavior with counter-scaling so labels/dots stay readable at any zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 6])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
        const k = event.transform.k;
        const invK = 1 / k;

        // ── Adaptive label visibility ──
        g.selectAll('.port-label.minor')
          .attr('display', k < 0.7 ? 'none' : 'block');

        // ── Counter-scale labels: stay ~11px on screen regardless of zoom ──
        const fontSize = Math.min(11, Math.max(7, 11 * invK));
        const labelOffset = 10 * invK;
        const labelOffsetY = 4 * invK;
        g.selectAll('.port-label')
          .attr('font-size', `${fontSize}px`)
          .each(function() {
            const el = d3.select(this);
            const bx = parseFloat(el.attr('data-x'));
            const by = parseFloat(el.attr('data-y'));
            el.attr('x', bx + labelOffset).attr('y', by + labelOffsetY);
          });

        // ── Counter-scale port dots ──
        g.selectAll('.port-dot')
          .attr('r', function() {
            return parseFloat(d3.select(this).attr('data-r')) * invK;
          })
          .attr('stroke-width', invK);
        g.selectAll('.port-glow')
          .attr('r', 12 * invK)
          .attr('stroke-width', 2 * invK);
        g.selectAll('.port-player-ring')
          .attr('r', 10 * invK)
          .attr('stroke-width', 1.5 * invK);

        // ── Counter-scale route day labels ──
        const daysFontSize = Math.min(9, Math.max(6, 9 * invK));
        g.selectAll('.route-days-label')
          .attr('font-size', `${daysFontSize}px`);

        // ── Counter-scale stroke widths ──
        g.selectAll('.sea-lane')
          .attr('stroke-width', function() {
            const el = d3.select(this);
            const base = el.classed('route-selected') ? 1.8 : 0.8;
            return base * invK;
          });
        g.selectAll('.country')
          .attr('stroke-width', 0.5 * invK);
      });

    svg.call(zoom);
    zoomRef.current = zoom;

    // Initial view: zoom to player's region
    const initialTransform = getRegionTransform(playerRegion, width, height);
    svg.call(zoom.transform, initialTransform);

  }, [topoData, worldPorts, reachablePortIds, selectedPort, nearestPortId, playerRegion, seaLaneEdges, getBaseProjection, getRegionTransform, devMode]);

  const handleSetSail = () => {
    if (!selectedPort) return;
    if (!devMode && !canDirectlySail(nearestPortId, selectedPort)) return;
    const travel = estimateSeaTravel(nearestPortId, selectedPort);
    const fromName = getWorldPortById(nearestPortId)?.name ?? nearestPortId;
    const toName = getWorldPortById(selectedPort)?.name ?? selectedPort;
    const modal = {
      fromPort: fromName,
      toPort: toName,
      totalDays: travel?.days ?? 1,
      targetPortId: selectedPort,
      fromPortId: nearestPortId,
      toPortId: selectedPort,
      force: devMode && !canDirectlySail(nearestPortId, selectedPort),
    };
    sfxSail();
    if (Math.random() < VOYAGE_INCIDENT_CHANCE) {
      setTravelModal(modal);
      return;
    }
    finishVoyage(modal, resolveVoyage({
      fromPortId: nearestPortId,
      toPortId: selectedPort,
      stance: 'standard',
      crew,
      stats,
      provisions,
      dayCount,
      chartedRoutes,
      weatherIntensity: weather.targetIntensity,
      windSpeed,
    }));
  };

  const finishVoyage = (modal: TravelModalState, resolution: VoyageResolution) => {
    const swap = () => {
      fastTravel(modal.targetPortId, { force: modal.force, voyage: resolution });
      setTravelModal(null);
      onClose();
    };
    if (onArrival) {
      void onArrival(modal.toPort, swap);
    } else {
      swap();
    }
  };

  const handleTravelComplete = (resolution: VoyageResolution) => {
    if (!travelModal) return;
    finishVoyage(travelModal, resolution);
  };

  const handleTravelSkip = (resolution: VoyageResolution) => {
    if (!travelModal) return;
    finishVoyage(travelModal, resolution);
  };

  // Keyboard
  useEffect(() => {
    const handleDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Shift') setDevMode(prev => !prev);
    };
    window.addEventListener('keydown', handleDown);
    return () => {
      window.removeEventListener('keydown', handleDown);
    };
  }, [onClose]);

  const nearestPort = getWorldPortById(nearestPortId);
  const portGroups = useMemo(() => groupPortsByRegion(worldPorts, playerRegion), [worldPorts, playerRegion]);

  const toggleRegion = (region: WorldRegion) => {
    setExpandedRegions(prev => {
      const next = new Set(prev);
      if (next.has(region)) next.delete(region);
      else next.add(region);
      return next;
    });
  };

  return (
    <motion.div
      data-testid="world-map-modal"
      {...modalBackdropMotion}
      className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto flex items-center justify-center p-4 z-40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        {...modalPanelMotion}
        className="relative w-full max-w-6xl h-[80vh] rounded-2xl overflow-hidden flex
          bg-[#0a0e18]/90 backdrop-blur-xl border border-[#2a2d3a]/50
          shadow-[0_8px_40px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.05)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Left: Map ────────────────────────────────── */}
        <div className="flex-1 relative flex flex-col">
          <svg
            ref={svgRef}
            className="w-full flex-1"
            style={{ display: 'block' }}
          />

          {/* Region quick-nav buttons */}
          <div className="flex items-center justify-center gap-1.5 px-4 py-2 bg-[#0a0e18]/80 border-t border-[#2a2d3a]/30">
            {REGION_NAV_ORDER.map(region => (
              <button
                key={region}
                onClick={() => { sfxClick(); navigateToRegion(region); }}
                onMouseEnter={() => sfxHover()}
                aria-selected={activeRegion === region}
                className={`px-3 py-1 rounded-full text-[10px] font-semibold tracking-wide transition-all ${
                  activeRegion === region
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-white/[0.03] text-slate-500 border border-white/[0.06] hover:bg-white/[0.06] hover:text-slate-400'
                }`}
              >
                {REGION_NAV_LABELS[region]}
              </button>
            ))}
          </div>

          {/* Hover tooltip */}
          <AnimatePresence>
            {hoveredPort && hoveredPort !== selectedPort && (() => {
              const port = getWorldPortById(hoveredPort);
              if (!port) return null;
              const isReachable = devMode || reachablePortIds.includes(hoveredPort);
              const travel = isReachable ? estimateSeaTravel(nearestPortId, hoveredPort) : null;
              return (
                <motion.div
                  key={hoveredPort}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="absolute top-4 left-4 bg-[#0a0e18]/80 backdrop-blur-md border border-[#2a2d3a]/50
                    rounded-lg px-3 py-2 shadow-lg pointer-events-none"
                >
                  <div className="text-amber-200/90 text-xs font-semibold">{port.name}</div>
                  <div className="text-slate-500 text-[10px]">{port.scale} {port.culture} port</div>
                  {travel && (
                    <div className="text-slate-400 text-[10px] mt-0.5">{travel.days}d sail · {travel.risk} risk</div>
                  )}
                </motion.div>
              );
            })()}
          </AnimatePresence>

          {/* Dev mode indicator */}
          {devMode && (
            <div className="absolute top-3 right-3 px-2.5 py-1 rounded bg-red-500/20 border border-red-500/40
              text-red-300 text-[10px] font-bold tracking-widest uppercase pointer-events-none z-10">
              DEV MODE
            </div>
          )}

          {/* Vignette */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ boxShadow: 'inset 0 0 60px rgba(0,0,0,0.4)' }}
          />
        </div>

        {/* ── Right: Sidebar ───────────────────────────── */}
        <div className="w-64 border-l border-[#2a2d3a]/40 flex flex-col bg-[#0a0e18]/60">
          {/* Header */}
          <div className="px-4 pt-4 pb-3 border-b border-[#2a2d3a]/30">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-slate-500">
                Sea Lanes
              </span>
              <button
                onClick={() => { sfxClose(); onClose(); }}
                className="w-6 h-6 rounded-md bg-white/5 hover:bg-white/10 border border-white/10
                  flex items-center justify-center transition-all"
              >
                <X size={12} className="text-white/50" />
              </button>
            </div>
            {/* Current position */}
            <div className="mt-3 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.5)]" />
              <span className="text-slate-300 text-xs">
                {nearestPort ? `Near ${nearestPort.name}` : 'Open sea'}
              </span>
            </div>
            <div className="text-slate-600 text-[10px] mt-1">Day {dayCount}</div>
          </div>

          {/* Port list — grouped by region */}
          <div className="flex-1 overflow-y-auto py-1 scrollbar-thin">
            {portGroups.map(({ region, label, ports }) => {
              const isExpanded = expandedRegions.has(region);
              const reachableInRegion = ports.filter(p => reachablePortIds.includes(p.id)).length;
              return (
                <div key={region}>
                  {/* Region header */}
                  <button
                    onClick={() => { sfxClick(); toggleRegion(region); }}
                    onMouseEnter={() => sfxHover()}
                    aria-pressed={isExpanded}
                    className="w-full flex items-center gap-2 px-4 py-2 text-left
                      hover:bg-white/[0.03] transition-colors"
                  >
                    {isExpanded
                      ? <ChevronDown size={11} className="text-slate-600" />
                      : <ChevronRight size={11} className="text-slate-600" />
                    }
                    <span className="text-[10px] font-bold tracking-[0.1em] uppercase text-slate-500">
                      {label}
                    </span>
                    <span className="text-[9px] text-slate-700 ml-auto">
                      {reachableInRegion > 0 ? `${reachableInRegion} route${reachableInRegion > 1 ? 's' : ''}` : ''}
                    </span>
                  </button>

                  {/* Port entries */}
                  {isExpanded && ports.map(port => {
                    const isSelected = selectedPort === port.id;
                    const isPlayer = port.id === nearestPortId;
                    const isReachable = reachablePortIds.includes(port.id);
                    const isClickable = devMode || isPlayer || isReachable;
                    const travel = (isReachable || devMode) ? estimateSeaTravel(nearestPortId, port.id) : null;
                    return (
                      <button
                        key={port.id}
                        onMouseEnter={() => sfxHover()}
                        aria-selected={isSelected}
                        onClick={() => {
                          if (!isClickable) return;
                          sfxClick();
                          setSelectedPort(isSelected ? null : port.id);
                        }}
                        className={`w-full text-left pl-8 pr-4 py-2 transition-all ${
                          isSelected
                            ? 'bg-amber-500/10 border-l-2 border-amber-500'
                            : isPlayer
                              ? 'border-l-2 border-blue-500/50 bg-blue-500/[0.05]'
                              : 'border-l-2 border-transparent hover:bg-white/[0.03]'
                        } ${!isClickable ? 'opacity-40 cursor-default' : 'cursor-pointer'}`}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full ${
                            isPlayer ? 'bg-blue-400' : isSelected ? 'bg-amber-400' : isReachable ? 'bg-amber-700' : 'bg-slate-700'
                          }`} />
                          <span className={`text-xs font-medium ${
                            isPlayer ? 'text-blue-300' : isSelected ? 'text-amber-200' : isReachable ? 'text-slate-400' : 'text-slate-600'
                          }`}>
                            {port.name}
                          </span>
                          {travel && (
                            <span className="text-[9px] text-slate-500 ml-auto">{travel.days}d</span>
                          )}
                          {isPlayer && (
                            <span className="text-[9px] text-blue-400/60 ml-auto">here</span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-600 ml-3.5 mt-0.5">
                          {port.scale} · {port.culture}
                          {travel ? ` · ${travel.risk} risk` : ''}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Bottom: Travel details + button */}
          <div className="border-t border-[#2a2d3a]/30 p-4">
            <AnimatePresence mode="wait">
              {travelInfo && selectedPort !== nearestPortId ? (
                <motion.div
                  key={selectedPort}
                  {...modalContentMotion}
                >
                  {/* Stats row */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex items-center gap-1.5">
                      <Clock size={11} className="text-slate-500" />
                      <span className="text-xs text-slate-300">{travelInfo.days}d</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle size={11} className={
                        travelInfo.risk === 'High' ? 'text-red-400' :
                        travelInfo.risk === 'Moderate' ? 'text-amber-400' : 'text-green-400'
                      } />
                      <span className="text-xs text-slate-300">{travelInfo.risk}</span>
                    </div>
                  </div>

                  {/* Set Sail button */}
                  <button
                    onClick={handleSetSail}
                    className="w-full py-2.5 rounded-lg text-xs font-semibold tracking-wide
                      bg-amber-500/10 border border-amber-500/40 text-amber-300
                      hover:bg-amber-500/20 hover:border-amber-500/60 hover:text-amber-200
                      hover:shadow-[0_0_16px_rgba(251,191,36,0.15)]
                      active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                  >
                    <Navigation size={13} />
                    Set Sail
                  </button>
                </motion.div>
              ) : selectedPort === nearestPortId ? (
                <motion.div
                  key="already-here"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 text-slate-500 text-xs"
                >
                  <Anchor size={12} />
                  <span>You are here</span>
                </motion.div>
              ) : selectedPort && !devMode ? (
                <motion.div
                  key="not-direct"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 text-slate-500 text-xs"
                >
                  <AlertTriangle size={12} />
                  <span>No direct sea lane from {nearestPort?.name ?? 'this port'}</span>
                </motion.div>
              ) : (
                <motion.div
                  key="placeholder"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-slate-600 text-[11px] text-center"
                >
                  Select a destination
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {/* Travel animation modal */}
      {travelModal && (
        <VoyageModal
          fromPort={travelModal.fromPort}
          toPort={travelModal.toPort}
          totalDays={travelModal.totalDays}
          fromPortId={travelModal.fromPortId}
          toPortId={travelModal.toPortId}
          onComplete={handleTravelComplete}
          onSkip={handleTravelSkip}
        />
      )}
    </motion.div>
  );
}
