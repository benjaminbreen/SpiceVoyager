import * as THREE from 'three';

export interface SerializedBufferAttribute {
  array: Float32Array | Uint16Array | Uint32Array;
  itemSize: number;
  normalized: boolean;
}

export interface SerializedGeometry {
  attributes: Record<string, SerializedBufferAttribute>;
  index: SerializedBufferAttribute | null;
}

export function serializeGeometry(geometry: THREE.BufferGeometry): SerializedGeometry {
  const attributes: Record<string, SerializedBufferAttribute> = {};
  for (const [name, attr] of Object.entries(geometry.attributes)) {
    const bufferAttr = attr as THREE.BufferAttribute;
    attributes[name] = {
      array: bufferAttr.array.slice() as Float32Array | Uint16Array | Uint32Array,
      itemSize: bufferAttr.itemSize,
      normalized: bufferAttr.normalized,
    };
  }
  const index = geometry.index
    ? {
        array: geometry.index.array.slice() as Uint16Array | Uint32Array,
        itemSize: geometry.index.itemSize,
        normalized: geometry.index.normalized,
      }
    : null;
  return { attributes, index };
}

export function deserializeGeometry(serialized: SerializedGeometry): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(serialized.attributes)) {
    geometry.setAttribute(name, new THREE.BufferAttribute(attr.array, attr.itemSize, attr.normalized));
  }
  if (serialized.index) {
    geometry.setIndex(new THREE.BufferAttribute(serialized.index.array, serialized.index.itemSize, serialized.index.normalized));
  }
  geometry.computeBoundingSphere();
  return geometry;
}

export function transferGeometryBuffers(serialized: SerializedGeometry): Transferable[] {
  const buffers: Transferable[] = [];
  for (const attr of Object.values(serialized.attributes)) {
    buffers.push(attr.array.buffer as ArrayBuffer);
  }
  if (serialized.index) buffers.push(serialized.index.array.buffer as ArrayBuffer);
  return buffers;
}
