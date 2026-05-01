import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useGameStore } from '../store/gameStore';
import { motion, AnimatePresence } from 'framer-motion';
import { sfxSail, sfxClose, sfxClick, sfxHover } from '../audio/SoundEffects';
import { X, Navigation, Anchor, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
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
  GATEWAYS,
  REGION_VIEWS,
  REGION_LABELS,
  type WorldRegion,
} from '../utils/worldPorts';
import VoyageModal from './VoyageModal';
import PassageInterstitial from './PassageInterstitial';
import { resolveVoyage, type VoyageResolution } from '../utils/voyageResolution';
import { modalBackdropMotion, modalContentMotion, modalPanelMotion } from '../utils/uiMotion';
import { useIsMobile } from '../utils/useIsMobile';

interface WorldMapModalChartProps {
  onClose: () => void;
  onArrival?: (portName: string, swap: () => void) => Promise<void>;
}

// ── Palette ────────────────────────────────────────────────────────────────
// Map colors are subtly warmer than the classic modal; never sepia. The brass
// is reserved for the rim, the Set Sail plaque, and the close knob — content
// surfaces stay glassy.
const COLORS = {
  ocean:        '#0b1220',          // slightly warmer than classic #0c1222
  land:         '#1d2338',
  landStroke:   'rgba(201,162,90,0.12)',
  graticule:    'rgba(201,162,90,0.05)',
  seaLane:      'rgba(255,255,255,0.06)',
  seaLaneSel:   'rgba(226,200,122,0.55)',  // brass dashes
  portPlayer:   '#94a8c4',           // silvered teal — distinct from brass
  portSelected: '#e2c87a',           // brass
  portReach:    '#c9a25a',
  portIdle:     'rgba(148,163,184,0.4)',
  labelPlayer:  '#b4c4dc',
  labelSelect:  '#f2d98f',
  labelReach:   'rgba(226,200,122,0.7)',
  labelIdle:    'rgba(148,163,184,0.42)',
  routeDays:    'rgba(242,217,143,0.85)',
  glow:         'rgba(226,200,122,0.42)',
  playerRing:   'rgba(148,168,196,0.5)',
};

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
  indianOcean: 'Indian Ocean',
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
  swapStarted?: boolean;
};

type PassageModalState = TravelModalState & {
  resolution: VoyageResolution;
  hasIncident: boolean;
  swapStarted: boolean;
};

// ── Decorative compass rose (SVG fragment, injected into D3 map) ───────────
// Placed in a low-information ocean quadrant; rendered at ~12% opacity.
const COMPASS_ROSE_PATH = `
  M 0,-28 L 4,-4 L 28,0 L 4,4 L 0,28 L -4,4 L -28,0 L -4,-4 Z
`;

export function WorldMapModalChart({ onClose, onArrival }: WorldMapModalChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [hoveredPort, setHoveredPort] = useState<string | null>(null);
  const [selectedPort, setSelectedPort] = useState<string | null>(null);
  const [topoData, setTopoData] = useState<any>(null);
  const [activeRegion, setActiveRegion] = useState<WorldRegion | 'world'>('world');
  const [expandedRegions, setExpandedRegions] = useState<Set<WorldRegion>>(new Set());
  const [devMode, setDevMode] = useState(false);

  const { isMobile } = useIsMobile();
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
  const [passageModal, setPassageModal] = useState<PassageModalState | null>(null);

  const travelInfo = useMemo(() => {
    if (!selectedPort || selectedPort === nearestPortId) return null;
    if (!devMode && !canDirectlySail(nearestPortId, selectedPort)) return null;
    const port = getWorldPortById(selectedPort);
    const voyage = estimateSeaTravel(nearestPortId, selectedPort);
    if (!port || !voyage) return null;
    return { ...voyage, port };
  }, [selectedPort, nearestPortId, devMode]);

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

  useEffect(() => {
    fetch('/countries-110m.json')
      .then(r => r.json())
      .then(setTopoData)
      .catch(() => {});
  }, []);

  const getBaseProjection = useCallback((width: number, height: number) => {
    return d3.geoMercator()
      .center([30, 10])
      .scale(Math.min(width, height) * 0.35)
      .translate([width / 2, height / 2]);
  }, []);

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
    const projected = baseProj(view.center);
    if (!projected) return d3.zoomIdentity;
    const tx = width / 2 - projected[0] * k;
    const ty = height / 2 - projected[1] * k;
    return d3.zoomIdentity.translate(tx, ty).scale(k);
  }, [getBaseProjection]);

  const navigateToRegion = useCallback((regionKey: WorldRegion | 'world') => {
    if (!svgRef.current || !zoomRef.current) return;
    const svg = d3.select(svgRef.current);
    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;
    const transform = getRegionTransform(regionKey, width, height);
    svg.transition().duration(750).call(zoomRef.current.transform as any, transform);
    setActiveRegion(regionKey);
  }, [getRegionTransform]);

  // ── D3 render — identical structure to classic modal, warmed palette ──
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
      .attr('fill', COLORS.ocean);

    const defs = svg.append('defs');
    defs.append('style').text(`
      @keyframes dash-march { to { stroke-dashoffset: -20; } }
      .route-selected { animation: dash-march 1.5s linear infinite; }
      @keyframes pulse-glow { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.75; } }
      .port-glow { animation: pulse-glow 2s ease-in-out infinite; }
      .port-player-ring { animation: dash-march 8s linear infinite; }
    `);

    // Screen-space clip so zoomed-out content can't spill past the SVG bounds
    defs.append('clipPath')
      .attr('id', 'map-viewport-clip')
      .append('rect')
      .attr('x', 0).attr('y', 0)
      .attr('width', width)
      .attr('height', height);

    // Radial ocean gradient — very subtle warmth pooling toward the edges
    const oceanGrad = defs.append('radialGradient')
      .attr('id', 'ocean-vignette')
      .attr('cx', '50%').attr('cy', '50%').attr('r', '70%');
    oceanGrad.append('stop').attr('offset', '0%').attr('stop-color', 'rgba(20,10,0,0)');
    oceanGrad.append('stop').attr('offset', '70%').attr('stop-color', 'rgba(15,8,0,0.25)');
    oceanGrad.append('stop').attr('offset', '100%').attr('stop-color', 'rgba(8,4,0,0.55)');

    // Clip wrapper keeps its coordinate system in screen space; the zoomed
    // `g` inside it is free to transform without content leaking past the edges.
    const clipWrapper = svg.append('g').attr('clip-path', 'url(#map-viewport-clip)');
    const g = clipWrapper.append('g').attr('class', 'map-content');

    // Graticule
    const graticule = d3.geoGraticule().step([15, 15]);
    g.append('path')
      .datum(graticule())
      .attr('d', path as any)
      .attr('fill', 'none')
      .attr('stroke', COLORS.graticule)
      .attr('stroke-width', 0.5);

    // Landmasses
    g.selectAll('.country')
      .data((countries as any).features)
      .enter()
      .append('path')
      .attr('class', 'country')
      .attr('d', path as any)
      .attr('fill', COLORS.land)
      .attr('stroke', COLORS.landStroke)
      .attr('stroke-width', 0.5);

    // Gateway labels — three tiers (primary ocean basins / secondary seas /
    // detail features). Tier governs typography, base font size, opacity, and
    // the zoom level at which the label fades in. Collision avoidance against
    // port labels happens later in cullLabelOverlaps.
    const gatewayGroup = g.append('g').attr('class', 'gateway-labels').attr('pointer-events', 'none');
    for (const [id, gw] of Object.entries(GATEWAYS)) {
      if (!gw.label) continue;
      const pos = projection(gw.coords);
      if (!pos) continue;
      const offset = gw.labelOffset ?? [0, 0];
      const tier = gw.labelTier ?? 'detail';
      const isPrimary = tier === 'primary';
      const text = isPrimary ? gw.label.toUpperCase() : gw.label;
      gatewayGroup.append('text')
        .attr('class', `gateway-label tier-${tier}`)
        .attr('data-tier', tier)
        .attr('data-x', pos[0] + offset[0])
        .attr('data-y', pos[1] + offset[1])
        .attr('x', pos[0] + offset[0])
        .attr('y', pos[1] + offset[1])
        .attr('text-anchor', 'middle')
        .attr('fill',
          isPrimary           ? 'rgba(186, 208, 232, 0.45)' :
          tier === 'secondary'? 'rgba(176, 198, 222, 0.40)' :
                                'rgba(162, 186, 210, 0.32)'
        )
        .attr('font-size',
          isPrimary           ? '11px' :
          tier === 'secondary'? '9.5px' :
                                '8.5px'
        )
        .attr('font-weight', isPrimary ? '500' : '450')
        .attr('font-style', isPrimary ? 'normal' : 'italic')
        .attr('font-family', '"Fraunces", serif')
        .attr('letter-spacing', isPrimary ? '0.22em' : '0.10em')
        .style('text-rendering', 'geometricPrecision')
        .style('font-variation-settings', isPrimary ? '"opsz" 144, "SOFT" 30' : '"opsz" 24, "SOFT" 60')
        .text(text);
    }

    // Decorative compass rose — placed in mid-Atlantic (empty quadrant)
    const compassPos = projection([-40, -20]);
    if (compassPos) {
      const rose = g.append('g')
        .attr('class', 'compass-rose')
        .attr('transform', `translate(${compassPos[0]}, ${compassPos[1]})`)
        .attr('opacity', 0.14)
        .attr('pointer-events', 'none');

      // Outer circle
      rose.append('circle')
        .attr('r', 32)
        .attr('fill', 'none')
        .attr('stroke', '#c9a25a')
        .attr('stroke-width', 0.8);
      rose.append('circle')
        .attr('r', 24)
        .attr('fill', 'none')
        .attr('stroke', '#c9a25a')
        .attr('stroke-width', 0.4);
      // Cardinal star
      rose.append('path')
        .attr('d', COMPASS_ROSE_PATH)
        .attr('fill', '#c9a25a')
        .attr('opacity', 0.7);
      // Secondary diagonal star (rotated 45°)
      rose.append('path')
        .attr('d', COMPASS_ROSE_PATH)
        .attr('fill', 'none')
        .attr('stroke', '#c9a25a')
        .attr('stroke-width', 0.5)
        .attr('transform', 'rotate(45) scale(0.7)');
      // N label
      rose.append('text')
        .attr('y', -38)
        .attr('text-anchor', 'middle')
        .attr('fill', '#c9a25a')
        .attr('font-size', '9px')
        .attr('font-weight', '700')
        .attr('font-family', '"Fraunces", serif')
        .attr('letter-spacing', '0.1em')
        .text('N');
    }

    // Sea lane — only the selected route is drawn. Waypoints come from the
    // gateway-graph Dijkstra search (see `buildSeaRoute` in worldPorts.ts);
    // each gateway is hand-placed in deep ocean, so segments between them
    // never cross land by construction. Catmull-Rom alpha(1) is chordal,
    // which hews tightly to the waypoints instead of overshooting.
    const seaLaneGroup = g.append('g').attr('class', 'sea-lanes');
    const lineGen = d3.line<[number, number]>()
      .x(d => d[0])
      .y(d => d[1])
      .curve(d3.curveCatmullRom.alpha(1));

    const selectedEdge = (selectedPort && selectedPort !== nearestPortId)
      ? seaLaneEdges.find(([a, b]) =>
          (a === nearestPortId && b === selectedPort) ||
          (b === nearestPortId && a === selectedPort))
      : null;

    if (selectedEdge) {
      const [fromId, toId] = selectedEdge;
      const fromCoords = WORLD_PORT_COORDS[fromId];
      const toCoords = WORLD_PORT_COORDS[toId];
      const from = fromCoords && projection(fromCoords);
      const to = toCoords && projection(toCoords);

      if (from && to && fromCoords && toCoords) {
        const gatewayCoords = getSeaLaneWaypoints(fromId, toId);
        const geoPath: [number, number][] = [fromCoords, ...gatewayCoords, toCoords];

        const projectedPoints: [number, number][] = [];
        for (const c of geoPath) {
          const p = projection(c);
          if (p) projectedPoints.push(p as [number, number]);
        }

        const pathD = lineGen(projectedPoints);
        if (pathD) {
          seaLaneGroup.append('path')
            .attr('class', 'route-selected sea-lane')
            .attr('d', pathD)
            .attr('fill', 'none')
            .attr('stroke', COLORS.seaLaneSel)
            .attr('stroke-width', 1.8)
            .attr('stroke-dasharray', '6,4');

          const travel = estimateSeaTravel(fromId, toId);
          if (travel) {
            const midIdx = Math.floor(projectedPoints.length / 2);
            const midPt = projectedPoints[midIdx];
            const labelText = `${travel.days} days`;
            // Halo: paint-order=stroke draws a wide dark stroke behind the
            // glyphs, fill on top — auto-fits the text and counter-scales
            // cleanly with the rest of the labels (no separate rect needed).
            const renderDays = (cls: string, fill: string, strokeWidth: number) =>
              seaLaneGroup.append('text')
                .attr('class', cls)
                .attr('x', midPt[0])
                .attr('y', midPt[1] - 8)
                .attr('text-anchor', 'middle')
                .attr('fill', fill)
                .attr('stroke', 'rgba(8, 14, 28, 0.95)')
                .attr('stroke-width', strokeWidth)
                .attr('stroke-linejoin', 'round')
                .attr('paint-order', 'stroke')
                .attr('font-size', '10px')
                .attr('font-weight', '700')
                .attr('font-family', '"Fraunces", serif')
                .attr('letter-spacing', '0.04em')
                .text(labelText);
            renderDays('route-days-label', COLORS.routeDays, 4);
          }
        }
      }
    }

    // Port markers
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

      if (isSelected) {
        portG.append('circle')
          .attr('class', 'port-glow')
          .attr('cx', projected[0]).attr('cy', projected[1])
          .attr('r', 12)
          .attr('fill', 'none')
          .attr('stroke', COLORS.glow)
          .attr('stroke-width', 2);
      }

      if (isPlayer) {
        portG.append('circle')
          .attr('class', 'port-player-ring')
          .attr('cx', projected[0]).attr('cy', projected[1])
          .attr('r', 10)
          .attr('fill', 'none')
          .attr('stroke', COLORS.playerRing)
          .attr('stroke-width', 1.5)
          .attr('stroke-dasharray', '3,3');
      }

      const dotColor = isPlayer ? COLORS.portPlayer
        : isSelected ? COLORS.portSelected
        : (isReachable || devMode) ? COLORS.portReach
        : COLORS.portIdle;
      const strokeColor = isInteractive ? 'rgba(255,240,200,0.55)' : 'rgba(255,255,255,0.12)';

      if (port.scale === 'Huge' || port.scale === 'Very Large') {
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

      const isLarge = port.scale === 'Large' || port.scale === 'Very Large' || port.scale === 'Huge';
      const labelColor = isPlayer ? COLORS.labelPlayer
        : isSelected ? COLORS.labelSelect
        : (isReachable || devMode) ? COLORS.labelReach
        : COLORS.labelIdle;
      const classes = [
        'port-label',
        isLarge ? 'major' : 'minor',
        isPlayer ? 'is-player' : '',
        isSelected ? 'is-selected' : '',
      ].filter(Boolean).join(' ');
      portG.append('text')
        .attr('class', classes)
        .attr('data-x', projected[0])
        .attr('data-y', projected[1])
        .attr('x', projected[0] + 10)
        .attr('y', projected[1] + 4)
        .attr('fill', labelColor)
        .attr('font-size', '11px')
        .attr('font-weight', isLarge || isPlayer ? '600' : '500')
        .attr('letter-spacing', '0.02em')
        .attr('font-family', '"Fraunces", serif')
        .text(port.name);
    });

    // Top-layer vignette (painted INSIDE the zoom group so it doesn't re-anchor
    // when panning — actually we want it fixed: leave out of `g`, put on svg)
    svg.append('rect')
      .attr('class', 'ocean-vignette-overlay')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'url(#ocean-vignette)')
      .attr('pointer-events', 'none');

    // Priority-based label placement. Player > selected > major > minor.
    // For each label, try four candidate positions around its dot (right,
    // left, above, below) and take the first one that doesn't overlap an
    // already-placed label. Only hide the label if every candidate collides.
    // After port labels are placed, gateway (sea/strait) labels are placed
    // against the same rect set, with port labels winning every contest.
    const cullLabelOverlaps = (k: number) => {
      const invK = 1 / k;
      // Visible viewport in g's local svg coords. Any label whose bbox extends
      // past these bounds is hidden — fixes labels clipping at the right edge
      // (covered by the side panel) and the left/top/bottom edges of the chart.
      const t = svgRef.current ? d3.zoomTransform(svgRef.current) : null;
      const tx = t?.x ?? 0;
      const ty = t?.y ?? 0;
      const edgePad = 4 * invK;
      const viewLeft   = (-tx) * invK + edgePad;
      const viewRight  = (width  - tx) * invK - edgePad;
      const viewTop    = (-ty) * invK + edgePad;
      const viewBottom = (height - ty) * invK - edgePad;
      const isOutOfBounds = (r: { x: number; y: number; w: number; h: number }) =>
        r.x < viewLeft || r.x + r.w > viewRight ||
        r.y < viewTop  || r.y + r.h > viewBottom;
      const nodes = g.selectAll<SVGTextElement, unknown>('.port-label').nodes();
      const items = nodes.map(node => {
        const cls = node.getAttribute('class') || '';
        const priority =
          cls.includes('is-player') ? 4 :
          cls.includes('is-selected') ? 3 :
          cls.includes('major') ? 2 : 1;
        return { node, priority, isMinor: cls.includes('minor') };
      });
      items.sort((a, b) => b.priority - a.priority);

      const placements: { dx: number; dy: number; anchor: 'start' | 'end' | 'middle' }[] = [
        { dx:  10 * invK, dy:  4 * invK, anchor: 'start' },   // right of dot
        { dx: -10 * invK, dy:  4 * invK, anchor: 'end' },     // left of dot
        { dx:  0,         dy: -7 * invK, anchor: 'middle' },  // above
        { dx:  0,         dy: 14 * invK, anchor: 'middle' },  // below
      ];

      const placed: { x: number; y: number; w: number; h: number }[] = [];
      const pad = 1.2 * invK;

      for (const { node, isMinor } of items) {
        if (isMinor && k < 0.7) {
          node.setAttribute('display', 'none');
          continue;
        }
        const bx = parseFloat(node.getAttribute('data-x') || '0');
        const by = parseFloat(node.getAttribute('data-y') || '0');
        node.removeAttribute('display');

        let placedOk = false;
        for (const { dx, dy, anchor } of placements) {
          node.setAttribute('x', String(bx + dx));
          node.setAttribute('y', String(by + dy));
          node.setAttribute('text-anchor', anchor);
          let bbox: SVGRect;
          try {
            bbox = node.getBBox();
          } catch {
            break;
          }
          const rect = {
            x: bbox.x - pad,
            y: bbox.y - pad,
            w: bbox.width + pad * 2,
            h: bbox.height + pad * 2,
          };
          const overlaps = placed.some(b =>
            rect.x < b.x + b.w &&
            rect.x + rect.w > b.x &&
            rect.y < b.y + b.h &&
            rect.y + rect.h > b.y
          );
          if (!overlaps && !isOutOfBounds(rect)) {
            placed.push(rect);
            placedOk = true;
            break;
          }
        }
        if (!placedOk) {
          node.setAttribute('display', 'none');
        }
      }

      // Gateway label pass — placed against port-label rects + each other.
      // Tier governs both visibility threshold and placement priority. We also
      // expand the port-label rects with a generous buffer so gateway labels
      // sit visibly clear of port markers, not just non-overlapping pixel-wise.
      const portBuffer = 8 * invK;
      const portRects = placed.map(r => ({
        x: r.x - portBuffer,
        y: r.y - portBuffer,
        w: r.w + portBuffer * 2,
        h: r.h + portBuffer * 2,
      }));
      const gatewayPlaced: { x: number; y: number; w: number; h: number }[] = [...portRects];

      const tierMinK: Record<string, number> = { primary: 0.42, secondary: 0.78, detail: 1.25 };
      const tierPriority: Record<string, number> = { primary: 3, secondary: 2, detail: 1 };

      const gwNodes = g.selectAll<SVGTextElement, unknown>('.gateway-label').nodes();
      const gwItems = gwNodes.map(node => {
        const tier = node.getAttribute('data-tier') || 'detail';
        return { node, tier, priority: tierPriority[tier] ?? 1 };
      });
      gwItems.sort((a, b) => b.priority - a.priority);

      const gwPlacements: { dx: number; dy: number; anchor: 'start' | 'end' | 'middle' }[] = [
        { dx:  0,         dy:  0,         anchor: 'middle' }, // base
        { dx:  0,         dy: -10 * invK, anchor: 'middle' }, // up
        { dx:  0,         dy:  12 * invK, anchor: 'middle' }, // down
        { dx:  14 * invK, dy:  0,         anchor: 'start'  }, // right
        { dx: -14 * invK, dy:  0,         anchor: 'end'    }, // left
      ];
      const gwPad = 2 * invK;

      for (const { node, tier } of gwItems) {
        if (k < (tierMinK[tier] ?? 1.25)) {
          node.setAttribute('display', 'none');
          continue;
        }
        const bx = parseFloat(node.getAttribute('data-x') || '0');
        const by = parseFloat(node.getAttribute('data-y') || '0');
        node.removeAttribute('display');

        let placedOk = false;
        for (const { dx, dy, anchor } of gwPlacements) {
          node.setAttribute('x', String(bx + dx));
          node.setAttribute('y', String(by + dy));
          node.setAttribute('text-anchor', anchor);
          let bbox: SVGRect;
          try {
            bbox = node.getBBox();
          } catch {
            break;
          }
          const rect = {
            x: bbox.x - gwPad,
            y: bbox.y - gwPad,
            w: bbox.width + gwPad * 2,
            h: bbox.height + gwPad * 2,
          };
          const overlaps = gatewayPlaced.some(b =>
            rect.x < b.x + b.w &&
            rect.x + rect.w > b.x &&
            rect.y < b.y + b.h &&
            rect.y + rect.h > b.y
          );
          if (!overlaps && !isOutOfBounds(rect)) {
            gatewayPlaced.push(rect);
            placedOk = true;
            break;
          }
        }
        if (!placedOk) {
          node.setAttribute('display', 'none');
        }
      }
    };

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 6])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
        const k = event.transform.k;
        const invK = 1 / k;

        const fontSize = Math.min(11, Math.max(7, 11 * invK));
        g.selectAll('.port-label').attr('font-size', `${fontSize}px`);

        // Gateway labels — counter-scaled per tier so each tier holds a roughly
        // constant on-screen size. Visibility is decided in cullLabelOverlaps:
        // tiers fade in at increasing zoom (primary always, secondary at ~0.8,
        // detail at ~1.25), and any label colliding with a port label is hidden.
        g.selectAll<SVGTextElement, unknown>('.gateway-label').each(function() {
          const el = d3.select(this);
          const tier = el.attr('data-tier') || 'detail';
          const baseSize = tier === 'primary' ? 11 : tier === 'secondary' ? 9.5 : 8.5;
          const minSize  = tier === 'primary' ? 8.5 : tier === 'secondary' ? 7.5 : 7;
          const maxSize  = tier === 'primary' ? 12 : tier === 'secondary' ? 10.5 : 9.5;
          const fontSize = Math.min(maxSize, Math.max(minSize, baseSize * invK));
          el.attr('font-size', `${fontSize}px`);
          // Reset to base anchor before cullLabelOverlaps re-positions it.
          const bx = parseFloat(el.attr('data-x'));
          const by = parseFloat(el.attr('data-y'));
          el.attr('x', bx).attr('y', by).attr('text-anchor', 'middle');
        });

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

        const daysFontSize = Math.min(10, Math.max(6, 10 * invK));
        g.selectAll('.route-days-label')
          .attr('font-size', `${daysFontSize}px`)
          .attr('stroke-width', 4 * invK);

        g.selectAll('.sea-lane')
          .attr('stroke-width', function() {
            const el = d3.select(this);
            const base = el.classed('route-selected') ? 1.8 : 0.8;
            return base * invK;
          });
        g.selectAll('.country')
          .attr('stroke-width', 0.5 * invK);

        // Compass rose counter-scales so it reads the same size regardless of zoom
        g.selectAll('.compass-rose')
          .attr('transform', function() {
            const pos = projection([-40, -20]);
            if (!pos) return '';
            return `translate(${pos[0]}, ${pos[1]}) scale(${invK})`;
          });

        // Resolve overlapping labels by priority
        cullLabelOverlaps(k);
      });

    svg.call(zoom);
    zoomRef.current = zoom;

    // Initial view: pull back from the tight regional framing so the player
    // can see neighboring sea lanes on open. Region nav buttons still use the
    // full regional scale.
    const regionTransform = getRegionTransform(playerRegion, width, height);
    const initialZoomOut = 0.5;
    const cx = width / 2;
    const cy = height / 2;
    const initialTransform = d3.zoomIdentity
      .translate(
        cx + (regionTransform.x - cx) * initialZoomOut,
        cy + (regionTransform.y - cy) * initialZoomOut,
      )
      .scale(regionTransform.k * initialZoomOut);
    svg.call(zoom.transform, initialTransform);

  }, [topoData, worldPorts, reachablePortIds, selectedPort, nearestPortId, playerRegion, seaLaneEdges, getBaseProjection, getRegionTransform, devMode, isMobile]);

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
    const resolution = resolveVoyage({
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
    });
    sfxSail();
    setPassageModal({
      ...modal,
      resolution,
      hasIncident: Math.random() < VOYAGE_INCIDENT_CHANCE,
      swapStarted: false,
    });
  };

  const finishVoyage = (modal: TravelModalState, resolution: VoyageResolution) => {
    if (modal.swapStarted) {
      setTravelModal(null);
      onClose();
      return;
    }
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

  const handleTravelComplete = (resolution: VoyageResolution) => { if (travelModal) finishVoyage(travelModal, resolution); };
  const handleTravelSkip = (resolution: VoyageResolution) => { if (travelModal) finishVoyage(travelModal, resolution); };
  const handleTravelResolutionReady = (resolution: VoyageResolution) => {
    if (!travelModal || travelModal.swapStarted) return;
    fastTravel(travelModal.targetPortId, { force: travelModal.force, voyage: resolution });
    setTravelModal({ ...travelModal, swapStarted: true });
  };

  const handlePassageDone = () => {
    if (!passageModal) return;
    const modal = passageModal;
    setPassageModal(null);
    if (modal.hasIncident) {
      setTravelModal(modal);
      return;
    }
    if (!modal.swapStarted) {
      fastTravel(modal.targetPortId, { force: modal.force, voyage: modal.resolution });
    }
    onClose();
  };

  useEffect(() => {
    if (!passageModal || passageModal.hasIncident || passageModal.swapStarted) return;
    fastTravel(passageModal.targetPortId, { force: passageModal.force, voyage: passageModal.resolution });
    setPassageModal({ ...passageModal, swapStarted: true });
  }, [fastTravel, passageModal]);

  useEffect(() => {
    const handleDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Shift') setDevMode(prev => !prev);
    };
    window.addEventListener('keydown', handleDown);
    return () => window.removeEventListener('keydown', handleDown);
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

  // ── Rendering ─────────────────────────────────────────────────────────────
  return (
    <motion.div
      data-testid="world-map-modal"
      {...modalBackdropMotion}
      className={`absolute inset-0 bg-black/65 backdrop-blur-sm pointer-events-auto flex items-center justify-center z-40 ${isMobile ? 'p-0' : 'p-4'}`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        {...modalPanelMotion}
        onClick={(e) => e.stopPropagation()}
	        className={`relative rounded-[18px] ${isMobile ? 'w-full h-[var(--app-height)]' : 'w-full max-w-6xl h-[82vh]'}`}
	        style={{
	          padding: isMobile
	            ? 'calc(3px + var(--sai-top)) calc(3px + var(--sai-right)) calc(3px + var(--sai-bottom)) calc(3px + var(--sai-left))'
	            : 7,
	          background:
	            'radial-gradient(ellipse at 22% 12%, #d4b16a 0%, #a78845 22%, #6b4f22 48%, #2c1f0c 100%)',
          boxShadow:
            '0 12px 40px rgba(0,0,0,0.75), inset 0 2px 3px rgba(255,225,160,0.35), inset 0 -2px 4px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.4)',
        }}
      >
        {/* ── Corner brass nails — tiny embellishment ─────────── */}
        <CornerNail position="tl" />
        <CornerNail position="tr" />
        <CornerNail position="bl" />
        <CornerNail position="br" />

        {/* ── Inner glass panel ──────────────────────────────── */}
        <div
          className={`relative w-full h-full rounded-[12px] overflow-hidden flex
            bg-[#070b14]/95 backdrop-blur-xl ${isMobile ? 'flex-col' : 'flex-row'}`}
          style={{
            boxShadow:
              'inset 0 0 0 1px #b89a6a, inset 0 0 0 2px rgba(0,0,0,0.5), inset 0 4px 12px rgba(0,0,0,0.7)',
          }}
        >
          {/* ── Map (top on mobile, left on desktop) ─────────── */}
	          <div
	            data-testid="world-map-chart-map"
	            className={`relative flex flex-col min-w-0 min-h-0 ${isMobile ? 'flex-1 basis-[58%]' : 'flex-1'}`}
	          >
            {/* Region tab ruler — chart-edge navigation */}
            <div className={`relative flex items-stretch border-b border-[#3a3020]/50
              bg-gradient-to-b from-[#0a0f1a]/90 to-transparent z-[5] ${
                isMobile
                  ? 'justify-start px-2 pt-2 pb-1.5 overflow-x-auto scrollbar-thin'
                  : 'justify-center px-4 pt-3 pb-2'
              }`}>
              <div className="flex items-stretch gap-0 shrink-0">
                {REGION_NAV_ORDER.map((region, i) => {
                  const active = activeRegion === region;
                  return (
                    <div key={region} className="flex items-stretch">
                      {i > 0 && (
                        <span className="w-px self-stretch my-1 bg-[#3a3020]/70" aria-hidden />
                      )}
                      <button
                        onClick={() => { sfxClick(); navigateToRegion(region); }}
                        onMouseEnter={() => sfxHover()}
                        aria-selected={active}
                        className={`group relative transition-all duration-200 ${isMobile ? 'px-2.5 py-1' : 'px-3.5 py-1.5'}`}
                        style={{ fontFamily: '"Fraunces", serif' }}
                      >
                        <span
                          className={`block text-[11px] uppercase transition-colors duration-200 ${
                            active
                              ? 'text-amber-300'
                              : 'text-slate-500 group-hover:text-amber-200/90'
                          }`}
                          style={{
                            letterSpacing: '0.14em',
                            fontWeight: active ? 600 : 500,
                          }}
                        >
                          {REGION_NAV_LABELS[region]}
                        </span>
                        {/* Active underline — brass hairline */}
                        <span
                          aria-hidden
                          className={`absolute left-2 right-2 bottom-0 h-[1.5px] transition-opacity duration-300 ${
                            active ? 'opacity-100' : 'opacity-0'
                          }`}
                          style={{
                            background:
                              'linear-gradient(to right, transparent, #e2c87a 20%, #e2c87a 80%, transparent)',
                            boxShadow: '0 0 6px rgba(226,200,122,0.5)',
                          }}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <svg
              ref={svgRef}
              className="w-full flex-1"
              style={{ display: 'block' }}
            />

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
                    className="absolute top-14 left-4 bg-[#0a0e18]/90 backdrop-blur-md
                      rounded-md px-3.5 py-2 shadow-[0_4px_14px_rgba(0,0,0,0.6)] pointer-events-none"
                    style={{
                      boxShadow:
                        'inset 0 0 0 1px rgba(184,154,106,0.35), 0 4px 14px rgba(0,0,0,0.6)',
                    }}
                  >
                    <div
                      className="text-amber-200 text-[12px]"
                      style={{ fontFamily: '"Fraunces", serif', fontWeight: 500 }}
                    >
                      {port.name}
                    </div>
                    <div className="text-slate-400/80 text-[10px] tracking-wide">
                      {port.scale} · {port.culture}
                    </div>
                    {travel && (
                      <div className="text-slate-300/80 text-[10px] mt-1 tabular-nums">
                        {travel.days}d sail · {travel.risk.toLowerCase()} risk
                      </div>
                    )}
                  </motion.div>
                );
              })()}
            </AnimatePresence>

            {/* Dev mode indicator */}
            {devMode && (
              <div
                className="absolute top-14 right-4 px-2.5 py-1 rounded
                  bg-red-500/15 text-red-300 text-[10px] font-bold tracking-[0.2em] uppercase
                  pointer-events-none z-10"
                style={{ boxShadow: 'inset 0 0 0 1px rgba(248,113,113,0.4)' }}
              >
                Dev Mode
              </div>
            )}

            {/* Inner glass vignette — warm-tinted */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ boxShadow: 'inset 0 0 60px rgba(20,10,0,0.55)' }}
            />
          </div>

          {/* ── Brass rule separating map & sidebar ─── */}
          <div
            aria-hidden
            className={`shrink-0 ${isMobile ? 'h-px w-full' : 'w-px self-stretch'}`}
            style={{
              background: isMobile
                ? 'linear-gradient(to right, transparent 0%, rgba(201,162,90,0.08) 10%, rgba(201,162,90,0.55) 50%, rgba(201,162,90,0.08) 90%, transparent 100%)'
                : 'linear-gradient(to bottom, transparent 0%, rgba(201,162,90,0.08) 10%, rgba(201,162,90,0.55) 50%, rgba(201,162,90,0.08) 90%, transparent 100%)',
            }}
          />

          {/* ── Sidebar (bottom on mobile, right on desktop) ─── */}
	          <div
	            data-testid="world-map-chart-route-sheet"
	            className={`shrink-0 flex flex-col bg-[#080c14]/70 min-h-0 ${isMobile ? 'w-full basis-[42%]' : 'w-72'}`}
	          >
            {/* Sidebar header — cartouche */}
            <div className="relative px-4 pt-3.5 pb-3 border-b border-[#2a2520]/50">
              <div className="flex items-center justify-between">
                {/* Flanked-rule heading */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    aria-hidden
                    className="h-px w-4 bg-gradient-to-r from-transparent to-amber-500/50"
                  />
                  <span
                    className="text-amber-400/90 uppercase"
                    style={{
                      fontFamily: '"Fraunces", serif',
                      fontSize: 11,
                      fontWeight: 500,
                      letterSpacing: '0.28em',
                      paddingLeft: '0.28em',
                    }}
                  >
                    Sea Lanes
                  </span>
                </div>

                {/* Brass knob close button */}
	                <BrassKnob mobile={isMobile} onClick={() => { sfxClose(); onClose(); }} />
              </div>

              {/* Current position */}
              <div className="mt-3 flex items-center gap-2.5">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{
                    backgroundColor: COLORS.portPlayer,
                    boxShadow: `0 0 8px ${COLORS.portPlayer}`,
                  }}
                />
                <span className="text-slate-200 text-[13px] truncate"
                  style={{ fontFamily: '"Fraunces", serif' }}
                >
                  {nearestPort ? `Near ${nearestPort.name}` : 'Open sea'}
                </span>
              </div>
              <div className="text-slate-500 text-[10px] mt-0.5 tracking-wider uppercase ml-4">
                Day {dayCount}
              </div>
            </div>

            {/* Port list — grouped by region */}
            <div className="flex-1 overflow-y-auto py-1 scrollbar-thin">
              {portGroups.map(({ region, label, ports }) => {
                const isExpanded = expandedRegions.has(region);
                const reachableInRegion = ports.filter(p => reachablePortIds.includes(p.id)).length;
                return (
                  <div key={region}>
                    {/* Region header — serif cartouche */}
                    <button
                      onClick={() => { sfxClick(); toggleRegion(region); }}
                      onMouseEnter={() => sfxHover()}
                      aria-pressed={isExpanded}
                      className="w-full flex items-center gap-2 px-4 py-2 text-left
                        hover:bg-amber-500/[0.04] transition-colors group"
                    >
                      {isExpanded
                        ? <ChevronDown size={11} className="text-amber-500/50 group-hover:text-amber-400/80 transition-colors" />
                        : <ChevronRight size={11} className="text-amber-500/40 group-hover:text-amber-400/70 transition-colors" />
                      }
                      <span
                        className="text-amber-500/75 uppercase group-hover:text-amber-400/95 transition-colors"
                        style={{
                          fontFamily: '"Fraunces", serif',
                          fontSize: 10.5,
                          letterSpacing: '0.18em',
                          fontWeight: 500,
                        }}
                      >
                        {label}
                      </span>
                      {reachableInRegion > 0 && (
                        <span className="text-[9px] text-slate-500 ml-auto tabular-nums tracking-wide">
                          {reachableInRegion} route{reachableInRegion > 1 ? 's' : ''}
                        </span>
                      )}
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
	                          data-testid={`world-route-port-${port.id}`}
	                          onMouseEnter={() => sfxHover()}
                          aria-selected={isSelected}
                          onClick={() => {
                            if (!isClickable) return;
                            sfxClick();
                            setSelectedPort(isSelected ? null : port.id);
                          }}
	                          className={`relative w-full text-left pl-8 pr-4 transition-all ${isMobile ? 'py-2.5' : 'py-1.5'} ${
                            isSelected
                              ? 'bg-amber-500/[0.09]'
                              : isPlayer
                                ? 'bg-slate-500/[0.05]'
                                : 'hover:bg-white/[0.03]'
                          } ${!isClickable ? 'opacity-40 cursor-default' : 'cursor-pointer'}`}
                          style={{ fontFamily: '"DM Sans", sans-serif' }}
                        >
                          {/* Left-edge inlay — brass/silvered */}
                          <span
                            aria-hidden
                            className="absolute left-0 top-0 bottom-0 w-[2px]"
                            style={{
                              background: isSelected
                                ? 'linear-gradient(to bottom, transparent, #e2c87a 20%, #e2c87a 80%, transparent)'
                                : isPlayer
                                  ? `linear-gradient(to bottom, transparent, ${COLORS.portPlayer}aa 20%, ${COLORS.portPlayer}aa 80%, transparent)`
                                  : 'transparent',
                              boxShadow: isSelected
                                ? '0 0 6px rgba(226,200,122,0.5)'
                                : 'none',
                            }}
                          />
                          <div className="flex items-center gap-2">
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{
                                backgroundColor: isPlayer ? COLORS.portPlayer
                                  : isSelected ? COLORS.portSelected
                                  : isReachable ? COLORS.portReach
                                  : '#3a3528',
                              }}
                            />
                            <span className={`text-xs font-medium truncate ${
                              isPlayer ? 'text-slate-200'
                                : isSelected ? 'text-amber-200'
                                : isReachable ? 'text-slate-300'
                                : 'text-slate-600'
                            }`}>
                              {port.name}
                            </span>
                            {travel && (
                              <span className="text-[10px] text-amber-100/50 ml-auto tabular-nums">
                                {travel.days}d
                              </span>
                            )}
                            {isPlayer && !travel && (
                              <span className="text-[9px] text-slate-500/80 ml-auto uppercase tracking-widest">
                                here
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500/80 ml-3.5 mt-0.5 tracking-wide">
                            {port.scale} · {port.culture}
                            {travel && ` · ${travel.risk.toLowerCase()} risk`}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* ── Voyage plate (bottom) ──────────── */}
            <div className="border-t border-[#2a2520]/50 p-3.5 bg-[#060810]/60">
              <AnimatePresence mode="wait">
                {travelInfo && selectedPort !== nearestPortId ? (
                  <motion.div
                    key={selectedPort}
                    {...modalContentMotion}
                  >
                    {/* Plate cartouche header */}
                    <div className="flex items-center justify-center gap-2.5 mb-2.5">
                      <span className="h-px w-6 bg-gradient-to-r from-transparent to-amber-500/50" />
                      <span
                        className="text-amber-400/90 uppercase"
                        style={{
                          fontFamily: '"Fraunces", serif',
                          fontSize: 10,
                          letterSpacing: '0.3em',
                          paddingLeft: '0.3em',
                          fontWeight: 500,
                        }}
                      >
                        Voyage
                      </span>
                      <span className="h-px w-6 bg-gradient-to-l from-transparent to-amber-500/50" />
                    </div>

                    {/* Destination line */}
                    <div
                      className="text-center text-slate-200 text-[13px] italic mb-2 truncate"
                      style={{ fontFamily: '"Fraunces", serif' }}
                    >
                      to {travelInfo.port.name}
                    </div>

                    {/* Stats row */}
                    <div className="flex items-center justify-center gap-5 mb-3 text-[11px]"
                      style={{ fontFamily: '"DM Sans", sans-serif' }}
                    >
                      <div className="flex items-baseline gap-1">
                        <span className="text-amber-300/90 font-bold tabular-nums text-sm">
                          {travelInfo.days}
                        </span>
                        <span className="text-slate-500 uppercase tracking-wider text-[9px]">days</span>
                      </div>
                      <span className="text-slate-700">·</span>
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{
                            backgroundColor:
                              travelInfo.risk === 'High' ? '#f87171' :
                              travelInfo.risk === 'Moderate' ? '#fbbf24' : '#34d399',
                            boxShadow: `0 0 6px ${
                              travelInfo.risk === 'High' ? 'rgba(248,113,113,0.6)' :
                              travelInfo.risk === 'Moderate' ? 'rgba(251,191,36,0.5)' : 'rgba(52,211,153,0.5)'
                            }`,
                          }}
                        />
                        <span className="text-slate-300">{travelInfo.risk.toLowerCase()} risk</span>
                      </div>
                    </div>

                    {/* Brass plaque — Set Sail */}
	                    <BrassPlaqueButton onClick={handleSetSail}>
                      <Navigation size={13} />
                      <span>Set Sail</span>
                    </BrassPlaqueButton>
                  </motion.div>
                ) : selectedPort === nearestPortId ? (
                  <motion.div
                    key="already-here"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="flex items-center justify-center gap-2 text-slate-500 text-[11px] py-2"
                    style={{ fontFamily: '"Fraunces", serif' }}
                  >
                    <Anchor size={12} className="text-amber-600/50" />
                    <span className="italic">You are here</span>
                  </motion.div>
                ) : selectedPort && !devMode ? (
                  <motion.div
                    key="not-direct"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="flex items-start gap-2 text-slate-400 text-[11px] py-1 px-1 leading-snug"
                  >
                    <AlertTriangle size={12} className="text-amber-600/60 shrink-0 mt-0.5" />
                    <span style={{ fontFamily: '"Fraunces", serif' }} className="italic">
                      No direct sea lane from {nearestPort?.name ?? 'this port'}
                    </span>
                  </motion.div>
                ) : (
                  <motion.div
                    key="placeholder"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="text-slate-500 text-[11px] text-center italic py-1"
                    style={{ fontFamily: '"Fraunces", serif' }}
                  >
                    Select a destination
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Travel animation */}
      {passageModal && (
        <PassageInterstitial
          fromPort={passageModal.fromPort}
          toPort={passageModal.toPort}
          toPortId={passageModal.toPortId}
          currentDay={dayCount}
          resolution={passageModal.resolution}
          hasIncident={passageModal.hasIncident}
          onDone={handlePassageDone}
        />
      )}
      {travelModal && (
        <VoyageModal
          fromPort={travelModal.fromPort}
          toPort={travelModal.toPort}
          totalDays={travelModal.totalDays}
          fromPortId={travelModal.fromPortId}
          toPortId={travelModal.toPortId}
          initialPhase="incident"
          onResolutionReady={handleTravelResolutionReady}
          onComplete={handleTravelComplete}
          onSkip={handleTravelSkip}
        />
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Brass hardware — small reusable pieces
// ═══════════════════════════════════════════════════════════════════════════

/** Tiny brass nail at a corner of the outer frame. */
function CornerNail({ position }: { position: 'tl' | 'tr' | 'bl' | 'br' }) {
  const positions: Record<typeof position, React.CSSProperties> = {
    tl: { top: 11, left: 11 },
    tr: { top: 11, right: 11 },
    bl: { bottom: 11, left: 11 },
    br: { bottom: 11, right: 11 },
  };
  return (
    <span
      aria-hidden
      className="absolute w-[7px] h-[7px] rounded-full pointer-events-none z-10"
      style={{
        ...positions[position],
        background:
          'radial-gradient(circle at 30% 30%, #e9cb85 0%, #a78845 50%, #3a2a10 100%)',
        boxShadow:
          'inset 0 -1px 1px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,225,160,0.4), 0 1px 1px rgba(0,0,0,0.5)',
      }}
    />
  );
}

/** Small circular brass pushbutton for the close action. */
function BrassKnob({ mobile = false, onClick }: { mobile?: boolean; onClick: () => void }) {
  return (
    <button
      data-testid="world-map-close"
      onClick={onClick}
      onMouseEnter={() => sfxHover()}
      className={`group relative rounded-full flex items-center justify-center
        transition-all active:scale-90 ${mobile ? 'w-9 h-9' : 'w-6 h-6'}`}
      style={{
        background:
          'radial-gradient(circle at 30% 25%, #d8b46a 0%, #a08548 35%, #5c4320 75%, #291c08 100%)',
        boxShadow:
          'inset 0 1px 1.5px rgba(255,225,160,0.4), inset 0 -1px 2px rgba(0,0,0,0.6), 0 1px 3px rgba(0,0,0,0.6)',
      }}
      title="Close (Esc)"
    >
      <X size={mobile ? 15 : 11} className="text-[#2a1f0c] group-hover:text-[#1a0f00] transition-colors" strokeWidth={3} />
    </button>
  );
}

/** Raised brass plaque button — the focal CTA. */
function BrassPlaqueButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      data-testid="world-map-set-sail"
      onClick={onClick}
      onMouseEnter={() => sfxHover()}
      className="group relative w-full py-2.5 rounded-md transition-all active:scale-[0.98]
        flex items-center justify-center gap-2"
      style={{
        background:
          'linear-gradient(180deg, #d8b46a 0%, #b99758 35%, #8a6a32 65%, #6b4f22 100%)',
        boxShadow:
          'inset 0 1px 1.5px rgba(255,235,180,0.55), inset 0 -1.5px 2px rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.5), 0 0 0 1px rgba(30,18,4,0.6)',
        fontFamily: '"Fraunces", serif',
      }}
    >
      <span
        className="flex items-center gap-2 text-[#2a1a04]"
        style={{
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textShadow: '0 1px 0 rgba(255,235,180,0.4)',
        }}
      >
        {children}
      </span>
      {/* Subtle hover highlight */}
      <span
        aria-hidden
        className="absolute inset-0 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
        style={{
          background: 'linear-gradient(180deg, rgba(255,235,180,0.15), transparent 60%)',
        }}
      />
    </button>
  );
}
