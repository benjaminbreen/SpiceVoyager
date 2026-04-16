import { useEffect, type RefObject } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

export const WATER_OVERLAY_LAYER = 1;
export const WAKE_SURFACE_OFFSET = 0.045;

export function useWaterOverlayLayer(ref: RefObject<THREE.Object3D | null>) {
  useEffect(() => {
    ref.current?.layers.set(WATER_OVERLAY_LAYER);
  }, [ref]);
}

export function WaterOverlayCameraLayer() {
  const { camera } = useThree();

  useEffect(() => {
    camera.layers.enable(WATER_OVERLAY_LAYER);
    return () => {
      camera.layers.disable(WATER_OVERLAY_LAYER);
    };
  }, [camera]);

  return null;
}
