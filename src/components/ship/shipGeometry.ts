import * as THREE from 'three';
import type { ShipProfile } from '../../utils/shipProfiles';

export type HullStationSpec = {
  z: number;
  width: number;
  chineWidth: number;
  deckWidth: number;
};

export type HullStation = HullStationSpec;

export function scaleStationSpecs(profile: ShipProfile, specs: HullStationSpec[]): HullStation[] {
  return specs.map((s) => ({
    z: s.z * profile.hull.length,
    width: s.width * profile.hull.width,
    chineWidth: s.chineWidth * profile.hull.width,
    deckWidth: s.deckWidth * profile.hull.width,
  }));
}

export function addQuad(indices: number[], a: number, b: number, c: number, d: number) {
  indices.push(a, b, c, a, c, d);
}

export function createHardChineHullGeometry(
  stations: HullStation[],
  hullHeight: number,
  options: { chineY?: number; keelY?: number } = {},
) {
  const chineY = options.chineY ?? 0.24;
  const keelY = options.keelY ?? -0.16;
  const vertices: number[] = [];
  const indices: number[] = [];

  for (const s of stations) {
    vertices.push(
      -s.width * 0.5, hullHeight, s.z,
      s.width * 0.5, hullHeight, s.z,
      s.chineWidth * 0.5, hullHeight * chineY, s.z,
      0, hullHeight * keelY, s.z,
      -s.chineWidth * 0.5, hullHeight * chineY, s.z,
    );
  }

  for (let i = 0; i < stations.length - 1; i++) {
    const a = i * 5;
    const b = (i + 1) * 5;
    addQuad(indices, a, a + 4, b + 4, b);
    addQuad(indices, a + 1, b + 1, b + 2, a + 2);
    addQuad(indices, a + 2, b + 2, b + 3, a + 3);
    addQuad(indices, a + 3, b + 3, b + 4, a + 4);
  }

  indices.push(0, 1, 2, 0, 2, 3, 0, 3, 4);
  const last = (stations.length - 1) * 5;
  indices.push(last, last + 4, last + 3, last, last + 3, last + 2, last, last + 2, last + 1);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function createDeckGeometry(stations: Pick<HullStation, 'z' | 'deckWidth'>[], y: number) {
  const vertices: number[] = [];
  const indices: number[] = [];

  for (const s of stations) {
    vertices.push(-s.deckWidth * 0.5, y, s.z, s.deckWidth * 0.5, y, s.z);
  }
  for (let i = 0; i < stations.length - 1; i++) {
    const a = i * 2;
    const b = (i + 1) * 2;
    addQuad(indices, a, b, b + 1, a + 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function createLineSegmentsGeometry(points: [number, number, number][]) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  return geo;
}
