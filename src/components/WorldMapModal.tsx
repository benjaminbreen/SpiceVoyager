import { useEffect, useRef, useState, useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { motion, AnimatePresence } from 'framer-motion';
import { sfxSail, sfxClose } from '../audio/SoundEffects';
import { X, Navigation, Anchor, Clock, AlertTriangle } from 'lucide-react';
import * as d3 from 'd3';
import { feature } from 'topojson-client';
import type { Topology, Objects } from 'topojson-specification';

// Real-world lat/lng for each port ID
const PORT_COORDS: Record<string, [number, number]> = {
  goa:      [73.88, 15.40],
  hormuz:   [56.27, 27.06],
  malacca:  [102.25, 2.19],
  aden:     [45.03, 12.80],
  zanzibar: [39.19, -6.17],
  macau:    [113.54, 22.20],
  mombasa:  [39.66, -4.04],
  calicut:  [75.78, 11.25],
  surat:    [72.83, 21.17],
  muscat:   [58.59, 23.61],
  mocha:    [43.25, 13.32],
  bantam:   [106.15, -6.02],
};

interface WorldMapModalProps {
  onClose: () => void;
}

export function WorldMapModal({ onClose }: WorldMapModalProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredPort, setHoveredPort] = useState<string | null>(null);
  const [selectedPort, setSelectedPort] = useState<string | null>(null);
  const [topoData, setTopoData] = useState<any>(null);

  const ports = useGameStore(s => s.ports);
  const discoveredPorts = useGameStore(s => s.discoveredPorts);
  const playerPos = useGameStore(s => s.playerPos);
  const dayCount = useGameStore(s => s.dayCount);
  const fastTravel = useGameStore(s => s.fastTravel);

  // Find which port the player is nearest to
  const nearestPortId = useMemo(() => {
    let nearest = '';
    let minDist = Infinity;
    for (const port of ports) {
      const dx = port.position[0] - playerPos[0];
      const dz = port.position[2] - playerPos[2];
      const dist = dx * dx + dz * dz;
      if (dist < minDist) {
        minDist = dist;
        nearest = port.id;
      }
    }
    return nearest;
  }, [ports, playerPos]);

  // Calculate travel info for selected port
  const travelInfo = useMemo(() => {
    if (!selectedPort) return null;
    const port = ports.find(p => p.id === selectedPort);
    if (!port) return null;
    const dx = port.position[0] - playerPos[0];
    const dz = port.position[2] - playerPos[2];
    const dist = Math.sqrt(dx * dx + dz * dz);
    const days = Math.max(1, Math.round(dist / 80));
    const risk = dist > 600 ? 'High' : dist > 300 ? 'Moderate' : 'Low';
    return { days, risk, port };
  }, [selectedPort, ports, playerPos]);

  // Load TopoJSON
  useEffect(() => {
    fetch('/countries-110m.json')
      .then(r => r.json())
      .then(setTopoData)
      .catch(() => {});
  }, []);

  // Render D3 map
  useEffect(() => {
    if (!svgRef.current || !topoData) return;

    const svg = d3.select(svgRef.current);
    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    svg.selectAll('*').remove();

    const projection = d3.geoMercator()
      .center([75, 8])
      .scale(Math.min(width, height) * 0.9)
      .translate([width / 2, height / 2]);

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

    // Graticule
    const graticule = d3.geoGraticule().step([15, 15]);
    svg.append('path')
      .datum(graticule())
      .attr('d', path as any)
      .attr('fill', 'none')
      .attr('stroke', 'rgba(255,255,255,0.04)')
      .attr('stroke-width', 0.5);

    // Landmasses
    svg.selectAll('.country')
      .data((countries as any).features)
      .enter()
      .append('path')
      .attr('d', path as any)
      .attr('fill', '#1a2035')
      .attr('stroke', 'rgba(255,255,255,0.08)')
      .attr('stroke-width', 0.5);

    // Route line from player to selected port
    if (selectedPort && PORT_COORDS[selectedPort] && PORT_COORDS[nearestPortId]) {
      const from = projection(PORT_COORDS[nearestPortId]);
      const to = projection(PORT_COORDS[selectedPort]);
      if (from && to) {
        // Dashed route line
        svg.append('line')
          .attr('x1', from[0]).attr('y1', from[1])
          .attr('x2', to[0]).attr('y2', to[1])
          .attr('stroke', 'rgba(251,191,36,0.3)')
          .attr('stroke-width', 1.5)
          .attr('stroke-dasharray', '6,4');
      }
    }

    // Port markers
    const activePorts = ports.filter(p => PORT_COORDS[p.id]);
    activePorts.forEach(port => {
      const coords = PORT_COORDS[port.id];
      if (!coords) return;
      const projected = projection(coords);
      if (!projected) return;

      const isDiscovered = discoveredPorts.includes(port.id);
      const isSelected = selectedPort === port.id;
      const isPlayer = port.id === nearestPortId;

      if (!isDiscovered) {
        // Undiscovered: dim dot
        svg.append('circle')
          .attr('cx', projected[0]).attr('cy', projected[1])
          .attr('r', 3)
          .attr('fill', 'rgba(255,255,255,0.1)')
          .attr('stroke', 'rgba(255,255,255,0.05)')
          .attr('stroke-width', 1);
        return;
      }

      // Glow ring for selected
      if (isSelected) {
        svg.append('circle')
          .attr('cx', projected[0]).attr('cy', projected[1])
          .attr('r', 12)
          .attr('fill', 'none')
          .attr('stroke', 'rgba(251,191,36,0.4)')
          .attr('stroke-width', 2);
      }

      // Player location indicator
      if (isPlayer) {
        svg.append('circle')
          .attr('cx', projected[0]).attr('cy', projected[1])
          .attr('r', 10)
          .attr('fill', 'none')
          .attr('stroke', 'rgba(96,165,250,0.5)')
          .attr('stroke-width', 1.5)
          .attr('stroke-dasharray', '3,3');
      }

      // Port dot
      svg.append('circle')
        .attr('cx', projected[0]).attr('cy', projected[1])
        .attr('r', isSelected ? 5 : 4)
        .attr('fill', isPlayer ? '#60a5fa' : isSelected ? '#fbbf24' : '#e2c87a')
        .attr('stroke', 'rgba(255,255,255,0.6)')
        .attr('stroke-width', 1)
        .attr('cursor', 'pointer')
        .on('mouseenter', () => setHoveredPort(port.id))
        .on('mouseleave', () => setHoveredPort(null))
        .on('click', () => setSelectedPort(port.id === selectedPort ? null : port.id));

      // Label
      svg.append('text')
        .attr('x', projected[0] + 10)
        .attr('y', projected[1] + 4)
        .attr('fill', isPlayer ? '#93bbfc' : isSelected ? '#fbbf24' : 'rgba(226,200,122,0.7)')
        .attr('font-size', '11px')
        .attr('font-weight', '600')
        .attr('font-family', '"Inter", system-ui, sans-serif')
        .attr('cursor', 'pointer')
        .text(port.name)
        .on('click', () => setSelectedPort(port.id === selectedPort ? null : port.id));
    });

  }, [topoData, ports, discoveredPorts, selectedPort, nearestPortId, playerPos]);

  const handleSetSail = () => {
    if (!selectedPort) return;
    sfxSail();
    fastTravel(selectedPort);
    onClose();
  };

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const nearestPort = ports.find(p => p.id === nearestPortId);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto flex items-center justify-center p-4 z-40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 400 }}
        className="relative w-full max-w-6xl h-[80vh] rounded-2xl overflow-hidden flex
          bg-[#0a0e18]/90 backdrop-blur-xl border border-[#2a2d3a]/50
          shadow-[0_8px_40px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.05)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Left: Map ────────────────────────────────── */}
        <div className="flex-1 relative">
          <svg
            ref={svgRef}
            className="w-full h-full"
            style={{ display: 'block' }}
          />

          {/* Hover tooltip */}
          <AnimatePresence>
            {hoveredPort && hoveredPort !== selectedPort && (() => {
              const port = ports.find(p => p.id === hoveredPort);
              if (!port) return null;
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
                </motion.div>
              );
            })()}
          </AnimatePresence>

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
                Navigation
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

          {/* Port list */}
          <div className="flex-1 overflow-y-auto py-2 scrollbar-thin">
            {ports
              .filter(p => discoveredPorts.includes(p.id) && PORT_COORDS[p.id])
              .map(port => {
                const isSelected = selectedPort === port.id;
                const isPlayer = port.id === nearestPortId;
                return (
                  <button
                    key={port.id}
                    onClick={() => setSelectedPort(isSelected ? null : port.id)}
                    className={`w-full text-left px-4 py-2.5 transition-all ${
                      isSelected
                        ? 'bg-amber-500/10 border-l-2 border-amber-500'
                        : 'border-l-2 border-transparent hover:bg-white/[0.03]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${
                        isPlayer ? 'bg-blue-400' : isSelected ? 'bg-amber-400' : 'bg-slate-600'
                      }`} />
                      <span className={`text-xs font-medium ${
                        isSelected ? 'text-amber-200' : 'text-slate-400'
                      }`}>
                        {port.name}
                      </span>
                      {isPlayer && (
                        <span className="text-[9px] text-blue-400/70 ml-auto">YOU</span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-600 ml-3.5 mt-0.5">
                      {port.scale} · {port.culture}
                    </div>
                  </button>
                );
              })}

            {/* Undiscovered hint */}
            {ports.filter(p => !discoveredPorts.includes(p.id) && PORT_COORDS[p.id]).length > 0 && (
              <div className="px-4 py-2 mt-1">
                <span className="text-[10px] text-slate-700 italic">
                  {ports.filter(p => !discoveredPorts.includes(p.id) && PORT_COORDS[p.id]).length} undiscovered
                </span>
              </div>
            )}
          </div>

          {/* Bottom: Travel details + button */}
          <div className="border-t border-[#2a2d3a]/30 p-4">
            <AnimatePresence mode="wait">
              {travelInfo && selectedPort !== nearestPortId ? (
                <motion.div
                  key={selectedPort}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15 }}
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
    </motion.div>
  );
}
