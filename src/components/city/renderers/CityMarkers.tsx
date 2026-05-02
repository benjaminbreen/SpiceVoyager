import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../../../store/gameStore';
import { buildingSemanticClass, SEMANTIC_STYLE } from '../../../utils/semanticClasses';
import { getPOIsForPort } from '../../../utils/poiDefinitions';
import { resolveSnappedPOI } from '../../../utils/proximityResolution';
import { getTerrainHeight } from '../../../utils/terrain';
import { SEA_LEVEL } from '../../../constants/world';

type PortsProp = ReturnType<typeof useGameStore.getState>['ports'];

// ── Sacred Building Markers (Sims-style plumbob) ─────────────────────────────
// Floating glowing purple octahedron above every spiritual building and over
// religious landmarks (Bom Jesus, Oude Kerk, etc.). Toggled by the Display
// tab's "Sacred Site Markers" switch; defaults on. Instanced — one draw call
// for diamonds, one for halos, regardless of port count.

export function SacredBuildingMarkers({ ports }: { ports: PortsProp }) {
  const visible = useGameStore((state) => state.renderDebug.sacredMarkers);
  const devSoloPort = useGameStore((state) => state.devSoloPort);

  const positions = useMemo(() => {
    if (!visible) return [] as [number, number, number][];
    const visiblePorts = devSoloPort
      ? ports.filter((p) => p.id === devSoloPort)
      : ports;
    const out: [number, number, number][] = [];
    for (const port of visiblePorts) {
      for (const b of port.buildings) {
        const cls = buildingSemanticClass(b);
        if (!cls || SEMANTIC_STYLE[cls].marker !== 'diamond') continue;
        // Float the diamond above the roofline so it reads from a distance
        // and clears most landmark spires.
        const topY = b.position[1] + Math.max(b.scale[1] * 2.5, 13);
        out.push([b.position[0], topY, b.position[2]]);
      }
      // POIs share the same marker pipeline. Religious POIs (shrines,
      // monasteries, sufi lodges) get the same purple plumbob as in-city
      // spirituals. Skip POIs whose marker is already drawn by the buildings
      // loop above: landmark-bound POIs (the landmark itself carries the
      // marker) and procedural shrines (which inject a synthetic spiritual
      // building with poiId === poi.id, also covered above).
      for (const poi of getPOIsForPort(port)) {
        if (SEMANTIC_STYLE[poi.class].marker !== 'diamond') continue;
        if (poi.location.kind === 'landmark') continue;
        if (port.buildings.some((b) => b.poiId === poi.id)) continue;
        // Unified resolver — same snapped position the silhouettes use,
        // so the purple plumbob can't disagree with the silhouette below.
        const placed = resolveSnappedPOI(poi, port);
        if (!placed) continue;
        const terrainY = getTerrainHeight(placed.x, placed.z);
        const topY = Math.max(terrainY, SEA_LEVEL) + 14;
        out.push([placed.x, topY, placed.z]);
      }
    }
    return out;
  }, [devSoloPort, ports, visible]);

  const diamondGeo = useMemo(() => new THREE.OctahedronGeometry(1.55, 0), []);
  const diamondMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#cc96ff',
    emissive: '#ad55ff',
    emissiveIntensity: 2.3,
    metalness: 0.15,
    roughness: 0.22,
    transparent: true,
    opacity: 0.93,
    toneMapped: false,
  }), []);

  const haloTex = useMemo(() => {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0.0, 'rgba(220, 160, 255, 1.0)');
    grad.addColorStop(0.45, 'rgba(170, 90, 240, 0.45)');
    grad.addColorStop(1.0, 'rgba(140, 70, 220, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
  const haloGeo = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1);
    return g;
  }, []);
  const haloMat = useMemo(() => new THREE.MeshBasicMaterial({
    map: haloTex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    opacity: 0.9,
  }), [haloTex]);

  const diamondRef = useRef<THREE.InstancedMesh>(null);
  const haloRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useRef(new THREE.Object3D());

  useFrame(({ clock, camera }) => {
    if (!visible) return;
    if (!diamondRef.current || !haloRef.current) return;
    const t = clock.elapsedTime;
    const pulse = 0.92 + Math.sin(t * 2.2) * 0.08;
    diamondMat.emissiveIntensity = 2.1 + Math.sin(t * 3.1) * 0.45;
    haloMat.opacity = 0.65 + Math.sin(t * 2.2) * 0.22;
    for (let i = 0; i < positions.length; i++) {
      const [px, py, pz] = positions[i];
      const bob = Math.sin(t * 1.6 + i * 0.7) * 0.38;
      const obj = dummy.current;
      obj.position.set(px, py + bob, pz);
      obj.rotation.set(0, t * 1.1 + i, 0);
      obj.scale.set(pulse, pulse * 1.15, pulse);
      obj.updateMatrix();
      diamondRef.current.setMatrixAt(i, obj.matrix);

      // Halo billboards to the camera so it always reads as a disc.
      obj.position.set(px, py + bob - 0.5, pz);
      obj.quaternion.copy(camera.quaternion);
      const haloPulse = 4.4 + Math.sin(t * 2.2 + i) * 0.5;
      obj.scale.set(haloPulse, haloPulse, haloPulse);
      obj.updateMatrix();
      haloRef.current.setMatrixAt(i, obj.matrix);
    }
    diamondRef.current.instanceMatrix.needsUpdate = true;
    haloRef.current.instanceMatrix.needsUpdate = true;
  });

  if (!visible || positions.length === 0) return null;

  return (
    <group>
      <instancedMesh
        ref={haloRef}
        args={[haloGeo, haloMat, positions.length]}
        frustumCulled={false}
        renderOrder={8}
      />
      <instancedMesh
        ref={diamondRef}
        args={[diamondGeo, diamondMat, positions.length]}
        frustumCulled={false}
        renderOrder={9}
      />
    </group>
  );
}

// ── POI Beacons ──────────────────────────────────────────────────────────────
// One cyan light pillar per Point of Interest. Shares no geometry with the
// religious plumbob system — these are *gameplay affordance* markers ("you
// can walk up and enter this"), not semantic-class markers. A religious POI
// bound to a landmark gets both: purple plumbob = religious site, cyan
// pillar = enterable POI.
//
// The pillar lifts from terrain (or landmark roofline for landmark-bound
// POIs) into a billboarded halo + small octahedron at the top. Undiscovered
// POIs pulse faster to read as "go check this out"; discovered ones settle
// into a slower shimmer. Same color as the minimap dot for cross-system
// recognition.

export function POIBeacons({ ports }: { ports: PortsProp }) {
  const visible = useGameStore((state) => state.renderDebug.poiBeacons);
  const devSoloPort = useGameStore((state) => state.devSoloPort);
  const discoveredPOIs = useGameStore((state) => state.discoveredPOIs);

  // Resolve { position, discovered } per POI. Hinterland and coords POIs use
  // terrain Y at their (x, z); landmark POIs lift off the bound building's
  // roofline so the pillar clears spires.
  const beacons = useMemo(() => {
    if (!visible) return [] as { pos: [number, number, number]; topY: number; discovered: boolean }[];
    const visiblePorts = devSoloPort
      ? ports.filter((p) => p.id === devSoloPort)
      : ports;
    const out: { pos: [number, number, number]; topY: number; discovered: boolean }[] = [];
    for (const port of visiblePorts) {
      for (const poi of getPOIsForPort(port)) {
        // Natural features (volcanoes, etc.) bring their own self-evident
        // visual marker — a glowing emissive crater + smoke column makes the
        // cyan pillar redundant and visually noisy. Skip the beacon; the
        // minimap dot + walk/sail proximity toast still fire.
        if (poi.kind === 'natural') continue;
        // Unified resolver — same snapped position the silhouettes,
        // bespoke renderers, and minimap all consume. Returns null when
        // no valid cell exists within 78u, in which case skip the beacon
        // entirely (matches the silhouette's own skip).
        const placed = resolveSnappedPOI(poi, port);
        if (!placed) continue;
        let baseY: number;
        if (poi.location.kind === 'landmark') {
          // Lift to roofline of the bound landmark so the pillar reads above
          // it instead of clipping through. Buildings carry a [w, h, d] scale
          // and the y-component is height. Look the building back up — the
          // unified resolver only returns x/z.
          const lid = poi.location.landmarkId;
          const b = port.buildings.find((bb) => bb.type === 'landmark' && bb.landmarkId === lid) as
            | { position: [number, number, number]; scale?: [number, number, number] }
            | undefined;
          if (!b) continue;
          baseY = b.position[1] + (b.scale ? b.scale[1] * 2 : 8);
        } else if (poi.kind === 'wreck') {
          baseY = SEA_LEVEL;
        } else {
          baseY = getTerrainHeight(placed.x, placed.z);
        }
        const topY = baseY + 12;
        out.push({
          pos: [placed.x, baseY, placed.z],
          topY,
          discovered: discoveredPOIs.includes(poi.id),
        });
      }
    }
    return out;
  }, [devSoloPort, ports, visible, discoveredPOIs]);

  // Vertical cylinder for the light pillar. Tapered (top narrower) so it reads
  // as a beam, not a column. Additive cyan — kept thin so it doesn't visually
  // dominate the city.
  const pillarGeo = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.05, 0.55, 12, 12, 1, true);
    // Origin to base of cylinder so we can place by base Y and grow upward
    g.translate(0, 6, 0);
    return g;
  }, []);
  const pillarMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#5fc8ff',
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  }), []);

  // Halo billboard at the top of the pillar — same texture pattern as
  // SacredBuildingMarkers but cyan-keyed.
  const haloTex = useMemo(() => {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0.0, 'rgba(180, 230, 255, 1.0)');
    grad.addColorStop(0.45, 'rgba(95, 200, 255, 0.5)');
    grad.addColorStop(1.0, 'rgba(60, 140, 220, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
  const haloGeo = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const haloMat = useMemo(() => new THREE.MeshBasicMaterial({
    map: haloTex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    opacity: 0.9,
  }), [haloTex]);

  // Tiny octahedron at the top, same shape as the plumbob but cyan, so the
  // pillar terminates in a recognizable shape rather than a soft halo alone.
  const tipGeo = useMemo(() => new THREE.OctahedronGeometry(0.55, 0), []);
  const tipMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#9be0ff',
    emissive: '#5fc8ff',
    emissiveIntensity: 2.2,
    metalness: 0.1,
    roughness: 0.25,
    transparent: true,
    opacity: 0.95,
    toneMapped: false,
  }), []);

  const pillarRef = useRef<THREE.InstancedMesh>(null);
  const haloRef = useRef<THREE.InstancedMesh>(null);
  const tipRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useRef(new THREE.Object3D());

  useFrame(({ clock, camera }) => {
    if (!visible) return;
    if (!pillarRef.current || !haloRef.current || !tipRef.current) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < beacons.length; i++) {
      const b = beacons[i];
      // Undiscovered POIs pulse faster + brighter; discovered settle into a
      // slower shimmer so the map doesn't feel busy after exploration.
      const pulseFreq = b.discovered ? 1.4 : 2.4;
      const pulseAmp = b.discovered ? 0.10 : 0.22;
      const pulse = 1 + Math.sin(t * pulseFreq + i * 0.9) * pulseAmp;

      const obj = dummy.current;
      // Pillar — at base, scale Y by pulse so it shimmers vertically
      obj.position.set(b.pos[0], b.pos[1], b.pos[2]);
      obj.rotation.set(0, 0, 0);
      obj.scale.set(1, pulse, 1);
      obj.updateMatrix();
      pillarRef.current.setMatrixAt(i, obj.matrix);

      // Halo — billboard at top of pillar
      obj.position.set(b.pos[0], b.topY, b.pos[2]);
      obj.quaternion.copy(camera.quaternion);
      const haloPulse = 3.6 + Math.sin(t * pulseFreq + i) * 0.6;
      obj.scale.set(haloPulse, haloPulse, haloPulse);
      obj.updateMatrix();
      haloRef.current.setMatrixAt(i, obj.matrix);

      // Tip octahedron — at top, gentle bob and rotate
      const bob = Math.sin(t * 1.4 + i * 0.7) * 0.25;
      obj.position.set(b.pos[0], b.topY + bob, b.pos[2]);
      obj.rotation.set(0, t * 0.9 + i, 0);
      const tipScale = 1 + Math.sin(t * pulseFreq + i) * 0.15;
      obj.scale.set(tipScale, tipScale, tipScale);
      obj.updateMatrix();
      tipRef.current.setMatrixAt(i, obj.matrix);
    }
    pillarRef.current.instanceMatrix.needsUpdate = true;
    haloRef.current.instanceMatrix.needsUpdate = true;
    tipRef.current.instanceMatrix.needsUpdate = true;

    // Tip emissive flicker so it reads as a live light source under bloom.
    tipMat.emissiveIntensity = 1.9 + Math.sin(t * 3.2) * 0.4;
    pillarMat.opacity = 0.45 + Math.sin(t * 1.8) * 0.10;
  });

  if (!visible || beacons.length === 0) return null;

  return (
    <group>
      <instancedMesh
        ref={pillarRef}
        args={[pillarGeo, pillarMat, beacons.length]}
        frustumCulled={false}
        renderOrder={7}
      />
      <instancedMesh
        ref={haloRef}
        args={[haloGeo, haloMat, beacons.length]}
        frustumCulled={false}
        renderOrder={8}
      />
      <instancedMesh
        ref={tipRef}
        args={[tipGeo, tipMat, beacons.length]}
        frustumCulled={false}
        renderOrder={9}
      />
    </group>
  );
}

