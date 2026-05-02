import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '../../../store/gameStore';
import { sampleCityFields, sampleWorldFields } from '../../../utils/cityFields';
import type { CityFieldKey } from '../../../utils/cityFieldTypes';
import { DISTRICT_COLORS, classifyDistrict } from '../../../utils/cityDistricts';
import type { DistrictKey } from '../../../utils/cityDistricts';
import type { CityFieldOverlaySample } from '../cityTypes';
import { lerpColor } from '../cityRandom';

type PortsProp = ReturnType<typeof useGameStore.getState>['ports'];

function cityFieldColor(field: CityFieldKey, value: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, value));
  switch (field) {
    case 'sanctity':
      return lerpColor([0.18, 0.66, 0.28], [0.58, 0.18, 0.82], t);
    case 'risk':
      return lerpColor([0.20, 0.78, 0.42], [0.96, 0.14, 0.10], t);
    case 'centrality':
      return lerpColor([0.14, 0.22, 0.44], [0.28, 0.86, 1.00], t);
    case 'access':
      return lerpColor([0.32, 0.22, 0.52], [0.18, 0.80, 0.98], t);
    case 'waterfront':
      return lerpColor([0.74, 0.58, 0.22], [0.10, 0.42, 0.98], t);
    case 'prominence':
      return lerpColor([0.22, 0.36, 0.54], [0.98, 0.82, 0.22], t);
    case 'nuisance':
      return lerpColor([0.18, 0.60, 0.74], [0.98, 0.38, 0.08], t);
    case 'prestige':
    default:
      return lerpColor([0.28, 0.26, 0.48], [1.00, 0.84, 0.22], t);
  }
}

function percentile(sortedValues: number[], t: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];
  const clamped = Math.max(0, Math.min(1, t));
  const index = clamped * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  const frac = index - lower;
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * frac;
}

export function CityFieldOverlay({ ports }: { ports: PortsProp }) {
  const overlayEnabled = useGameStore((state) => state.renderDebug.cityFieldOverlay);
  const overlayMode = useGameStore((state) => state.renderDebug.cityFieldMode);
  const devSoloPort = useGameStore((state) => state.devSoloPort);
  const worldSize = useGameStore((state) => state.worldSize);

  const samples = useMemo(() => {
    if (!overlayEnabled) return [] as CityFieldOverlaySample[];

    const visiblePorts = devSoloPort
      ? ports.filter((port) => port.id === devSoloPort)
      : ports;

    // District mode is categorical — one color per district class, no
    // per-field normalization. Only per-port samples are classified (the
    // out-of-city world samples have no meaningful district identity).
    if (overlayMode === 'district') {
      const overlaySamples: CityFieldOverlaySample[] = [];
      for (const port of visiblePorts) {
        for (const sample of sampleCityFields(port)) {
          const district: DistrictKey = classifyDistrict(sample.values, port.scale);
          overlaySamples.push({
            pos: [sample.x, sample.y + 0.06, sample.z],
            scale: [sample.size * 0.98, sample.size * 0.98, 1],
            color: DISTRICT_COLORS[district],
          });
        }
      }
      return overlaySamples;
    }

    const rawSamples: { x: number; y: number; z: number; size: number; value: number }[] = [];

    for (const worldSample of sampleWorldFields(visiblePorts, worldSize)) {
      rawSamples.push({
        x: worldSample.x,
        y: worldSample.y,
        z: worldSample.z,
        size: worldSample.size,
        value: worldSample.values[overlayMode],
      });
    }

    for (const port of visiblePorts) {
      for (const sample of sampleCityFields(port)) {
        rawSamples.push({
          x: sample.x,
          y: sample.y,
          z: sample.z,
          size: sample.size,
          value: sample.values[overlayMode],
        });
      }
    }

    if (rawSamples.length === 0) return [] as CityFieldOverlaySample[];

    const sortedValues = rawSamples
      .map((sample) => sample.value)
      .sort((a, b) => a - b);
    let minValue = percentile(sortedValues, 0.05);
    let maxValue = percentile(sortedValues, 0.95);
    if (maxValue - minValue < 0.05) {
      minValue = sortedValues[0];
      maxValue = sortedValues[sortedValues.length - 1];
    }

    const overlaySamples: CityFieldOverlaySample[] = [];
    const range = Math.max(0.001, maxValue - minValue);
    for (const sample of rawSamples) {
      const normalizedValue = Math.max(0, Math.min(1, (sample.value - minValue) / range));
      overlaySamples.push({
        pos: [sample.x, sample.y + 0.06, sample.z],
        scale: [sample.size * 0.98, sample.size * 0.98, 1],
        color: cityFieldColor(overlayMode, normalizedValue),
      });
    }

    return overlaySamples;
  }, [devSoloPort, overlayEnabled, overlayMode, ports, worldSize]);

  if (!overlayEnabled || samples.length === 0) return null;
  return <CityFieldOverlayInstances samples={samples} />;
}

export function CityFieldOverlayInstances({ samples }: { samples: CityFieldOverlaySample[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummyRef = useRef(new THREE.Object3D());
  const colorRef = useRef(new THREE.Color());
  const geometry = useMemo(() => {
    const plane = new THREE.PlaneGeometry(1, 1);
    plane.rotateX(-Math.PI / 2);
    return plane;
  }, []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    fog: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  }), []);

  useEffect(() => {
    if (!meshRef.current) return;
    const dummy = dummyRef.current;
    const color = colorRef.current;
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      dummy.position.set(...sample.pos);
      dummy.scale.set(...sample.scale);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
      color.setRGB(sample.color[0], sample.color[1], sample.color[2]);
      meshRef.current.setColorAt(i, color);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  }, [samples]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, samples.length]}
      frustumCulled={false}
      renderOrder={0}
    />
  );
}

