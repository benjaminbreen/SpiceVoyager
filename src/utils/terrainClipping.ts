import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SEA_LEVEL } from '../constants/world';

// Clip land geometry at the water surface so no land triangles exist below
// the water plane — this eliminates z-fighting at the coastline.
export const COASTLINE_CLIP_LEVEL = SEA_LEVEL - 0.05;

export type TerrainVertex = {
  position: THREE.Vector3;
  color: THREE.Color;
};

export function cloneTerrainVertex(vertex: TerrainVertex): TerrainVertex {
  return {
    position: vertex.position.clone(),
    color: vertex.color.clone(),
  };
}

export function interpolateTerrainVertex(a: TerrainVertex, b: TerrainVertex, clipLevel: number): TerrainVertex {
  const denom = b.position.z - a.position.z;
  const t = denom === 0 ? 0 : (clipLevel - a.position.z) / denom;

  return {
    position: a.position.clone().lerp(b.position, t),
    color: a.color.clone().lerp(b.color, t),
  };
}

export function clipTriangleToSeaLevel(vertices: TerrainVertex[], keepAbove: boolean, clipLevel: number): TerrainVertex[] {
  const clipped: TerrainVertex[] = [];

  for (let i = 0; i < vertices.length; i++) {
    const current = vertices[i];
    const next = vertices[(i + 1) % vertices.length];
    const currentInside = keepAbove
      ? current.position.z >= clipLevel
      : current.position.z <= clipLevel;
    const nextInside = keepAbove
      ? next.position.z >= clipLevel
      : next.position.z <= clipLevel;

    if (currentInside && nextInside) {
      clipped.push(cloneTerrainVertex(next));
    } else if (currentInside && !nextInside) {
      clipped.push(interpolateTerrainVertex(current, next, clipLevel));
    } else if (!currentInside && nextInside) {
      clipped.push(interpolateTerrainVertex(current, next, clipLevel));
      clipped.push(cloneTerrainVertex(next));
    }
  }

  return clipped;
}

export function appendClippedPolygon(
  polygon: TerrainVertex[],
  positionTarget: number[],
  colorTarget: number[],
) {
  if (polygon.length < 3) return;

  for (let i = 1; i < polygon.length - 1; i++) {
    const triangle = [polygon[0], polygon[i], polygon[i + 1]];
    for (const vertex of triangle) {
      positionTarget.push(vertex.position.x, vertex.position.y, vertex.position.z);
      colorTarget.push(vertex.color.r, vertex.color.g, vertex.color.b);
    }
  }
}

export function buildTerrainSurfaceGeometry(
  sourceGeometry: THREE.BufferGeometry,
  keepAbove: boolean,
  clipLevel: number,
): THREE.BufferGeometry {
  const workingGeometry = sourceGeometry.index
    ? sourceGeometry.toNonIndexed()
    : sourceGeometry.clone();
  const positionAttr = workingGeometry.getAttribute('position') as THREE.BufferAttribute;
  const colorAttr = workingGeometry.getAttribute('color') as THREE.BufferAttribute;
  const positions: number[] = [];
  const colors: number[] = [];

  // Reuse triangle vertex objects to avoid millions of allocations
  const triangle: TerrainVertex[] = [
    { position: new THREE.Vector3(), color: new THREE.Color() },
    { position: new THREE.Vector3(), color: new THREE.Color() },
    { position: new THREE.Vector3(), color: new THREE.Color() },
  ];

  for (let i = 0; i < positionAttr.count; i += 3) {
    for (let j = 0; j < 3; j++) {
      const index = i + j;
      triangle[j].position.set(
        positionAttr.getX(index),
        positionAttr.getY(index),
        positionAttr.getZ(index),
      );
      triangle[j].color.setRGB(
        colorAttr.getX(index),
        colorAttr.getY(index),
        colorAttr.getZ(index),
      );
    }

    const clippedPolygon = clipTriangleToSeaLevel(triangle, keepAbove, clipLevel);
    appendClippedPolygon(clippedPolygon, positions, colors);
  }

  workingGeometry.dispose();

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  // Merge duplicate vertices so computeVertexNormals averages normals across
  // adjacent faces — this produces smooth shading instead of flat polygon facets.
  const merged = mergeVertices(geometry, 0.01);
  merged.computeVertexNormals();

  geometry.dispose();
  return merged;
}
