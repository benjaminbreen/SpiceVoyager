import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../../store/gameStore';
import { getBuildingDamageVersion } from '../../utils/impactShakeState';
import { POISilhouettes } from '../POIArchetypes';
import { BespokePOIs } from '../BespokePOIs';

import type { Part } from './cityTypes';
import { createBuildingGeometries, createBuildingMaterials } from './cityMaterials';
import { buildCityParts } from './buildCityParts';
import { InstancedParts } from './renderers/InstancedParts';
import { CityRoads } from './renderers/CityRoads';
import { CityFieldOverlay } from './renderers/CityFieldOverlay';
import { FortHostilityWarnings, POIBeacons, SacredBuildingMarkers } from './renderers/CityMarkers';
import {
  BuildingCollapseDust,
  BuildingDamageSmoke,
  BuildingDestructionFlames,
  ChimneySmoke,
  CityTorches,
  RuinedBuildingDebris,
  collectCollapseDustSources,
  collectDamageSmokeSpots,
  collectDestructionFlames,
  collectRuinedBuildingDebris,
} from './renderers/CityEffects';

function updateBuildingSunUniform(materials: Record<string, THREE.Material>, sunDir: THREE.Vector3) {
  Object.values(materials).forEach((material) => {
    const shader = material.userData.shader as THREE.WebGLProgramParametersWithUniforms | undefined;
    const uniform = shader?.uniforms?.uBuildingSunDir as { value: THREE.Vector3 } | undefined;
    uniform?.value.copy(sunDir);
  });
}

export function ProceduralCity() {
  const ports = useGameStore(s => s.ports);
  const [damageVersion, setDamageVersion] = useState(getBuildingDamageVersion());
  const damageVersionRef = useRef(damageVersion);
  const sunDirRef = useRef(new THREE.Vector3());

  // Dark material created separately for per-frame emissive updates (window glow).
  // polygonOffset biases these decal-like parts forward so they don't z-fight with
  // the wall face they sit against (doors/windows are placed at wall + 0.05).
  const darkMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#1e1a14',
    roughness: 0.95,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  }), []);

  const litWindowMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#2a1d12',
    roughness: 0.9,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  }), []);

  const geos = useMemo(() => createBuildingGeometries(), []);

  const mats = useMemo(() => createBuildingMaterials(darkMat, litWindowMat), [darkMat, litWindowMat]);

  const overlayMats = useMemo(() => createBuildingMaterials(darkMat, litWindowMat, true), [darkMat, litWindowMat]);

  // Animate window glow and shader sun-facing lift based on time of day.
  useFrame(() => {
    const timeOfDay = useGameStore.getState().timeOfDay;
    const sunAngle = ((timeOfDay - 6) / 24) * Math.PI * 2;
    const sunH = Math.sin(sunAngle);
    const clampedSunH = Math.max(0, sunH);
    sunDirRef.current.set(
      Math.cos(sunAngle) * 100,
      Math.pow(clampedSunH, 0.55) * 100,
      -Math.sin(sunAngle) * 15,
    ).normalize();
    updateBuildingSunUniform(mats, sunDirRef.current);
    updateBuildingSunUniform(overlayMats, sunDirRef.current);

    // Ramp up glow as sun drops below horizon
    const nightFactor = Math.max(0, Math.min(1, (0.1 - sunH) / 0.3));
    litWindowMat.emissive.setRGB(0.85, 0.48, 0.16);
    litWindowMat.emissiveIntensity = nightFactor * 0.36;

    const latestDamageVersion = getBuildingDamageVersion();
    if (latestDamageVersion !== damageVersionRef.current) {
      damageVersionRef.current = latestDamageVersion;
      setDamageVersion(latestDamageVersion);
    }
  });

  // Build all geometry parts + collect torch positions
  const { parts, torchSpots, smokeSpots } = useMemo(() => buildCityParts(ports), [ports]);

  const damageSmokeSpots = useMemo(() => collectDamageSmokeSpots(ports), [ports, damageVersion]);
  const ruinedBuildingDebris = useMemo(() => collectRuinedBuildingDebris(ports), [ports, damageVersion]);
  const collapseDustSources = useMemo(() => collectCollapseDustSources(ports), [ports]);
  const destructionFlames = useMemo(() => collectDestructionFlames(ports), [ports, damageVersion]);

  // Group parts by geo+mat (+ overlay flag). Overlay parts bucket into a
  // parallel material with polygonOffset so flat ground-hugging surfaces
  // (dock decks, plaza paving) don't z-fight with terrain or water layers.
  const groups = useMemo(() => {
    const map = new Map<string, Part[]>();
    parts.forEach(p => {
      const key = `${p.geo}_${p.mat}${p.overlay ? '_overlay' : ''}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    });
    return map;
  }, [parts]);

  return (
    <group>
      {Array.from(groups.entries()).map(([key, groupParts]) => {
        const segments = key.split('_');
        const geoName = segments[0] as keyof typeof geos;
        const matName = segments[1] as keyof typeof mats;
        const isOverlay = segments[2] === 'overlay';
        const material = isOverlay ? overlayMats[matName] : mats[matName];
        return (
          <InstancedParts
            key={key}
            parts={groupParts}
            geometry={geos[geoName]}
            material={material}
          />
        );
      })}
      <CityRoads ports={ports} />
      <CityFieldOverlay ports={ports} />
      <FortHostilityWarnings ports={ports} />
      <SacredBuildingMarkers ports={ports} />
      <POIBeacons ports={ports} />
      <POISilhouettes ports={ports} />
      <BespokePOIs ports={ports} />
      <CityTorches spots={torchSpots} />
      <ChimneySmoke spots={smokeSpots} />
      <BuildingDamageSmoke spots={damageSmokeSpots} />
      <BuildingCollapseDust sources={collapseDustSources} />
      <BuildingDestructionFlames sources={destructionFlames} />
      <RuinedBuildingDebris ruins={ruinedBuildingDebris} />
    </group>
  );
}
