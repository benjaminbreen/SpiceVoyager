import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { chunkyMat } from './atmosphere';

type RGB = readonly [number, number, number];

export type BannerPattern =
  | { kind: 'plain'; color: RGB }
  | { kind: 'cross'; field: RGB; cross: RGB; crossWidth?: number; centerX?: number }
  | { kind: 'saltire'; field: RGB; saltire: RGB; width?: number }
  | { kind: 'triband-h'; top: RGB; middle: RGB; bottom: RGB }
  | { kind: 'patch'; field: RGB; patch: RGB; device?: RGB };

interface WavingBannerProps {
  position: readonly [number, number, number];
  rotationY?: number;
  width?: number;
  height?: number;
  poleHeight?: number;
  poleRadius?: number;
  poleColor?: RGB;
  finialColor?: RGB;
  pattern: BannerPattern;
  phase?: number;
  amplitude?: number;
  speed?: number;
}

function colorCss(c: RGB): string {
  return `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
}

function drawBannerPattern(ctx: CanvasRenderingContext2D, pattern: BannerPattern, w: number, h: number) {
  switch (pattern.kind) {
    case 'plain':
      ctx.fillStyle = colorCss(pattern.color);
      ctx.fillRect(0, 0, w, h);
      return;
    case 'cross': {
      ctx.fillStyle = colorCss(pattern.field);
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = colorCss(pattern.cross);
      const crossW = (pattern.crossWidth ?? 0.15) * h;
      const cx = (pattern.centerX ?? 0.5) * w;
      ctx.fillRect(0, h * 0.5 - crossW * 0.5, w, crossW);
      ctx.fillRect(cx - crossW * 0.5, 0, crossW, h);
      return;
    }
    case 'saltire': {
      ctx.fillStyle = colorCss(pattern.field);
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = colorCss(pattern.saltire);
      ctx.lineWidth = (pattern.width ?? 0.16) * h;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(w * 0.08, h * 0.08);
      ctx.lineTo(w * 0.92, h * 0.92);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w * 0.92, h * 0.08);
      ctx.lineTo(w * 0.08, h * 0.92);
      ctx.stroke();
      return;
    }
    case 'triband-h': {
      ctx.fillStyle = colorCss(pattern.top);
      ctx.fillRect(0, 0, w, h / 3);
      ctx.fillStyle = colorCss(pattern.middle);
      ctx.fillRect(0, h / 3, w, h / 3);
      ctx.fillStyle = colorCss(pattern.bottom);
      ctx.fillRect(0, h * 2 / 3, w, h / 3);
      return;
    }
    case 'patch': {
      ctx.fillStyle = colorCss(pattern.field);
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = colorCss(pattern.patch);
      const patch = h * 0.42;
      ctx.fillRect(w * 0.22, h * 0.5 - patch * 0.5, patch, patch);
      if (pattern.device) {
        ctx.fillStyle = colorCss(pattern.device);
        ctx.beginPath();
        ctx.arc(w * 0.22 + patch * 0.5, h * 0.5, patch * 0.17, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
  }
}

export function WavingBanner({
  position,
  rotationY = 0,
  width = 2.6,
  height = 1.6,
  poleHeight = 4.0,
  poleRadius = 0.09,
  poleColor = [0.32, 0.20, 0.12],
  finialColor = [0.82, 0.66, 0.22],
  pattern,
  phase = 0,
  amplitude = 0.32,
  speed = 4.0,
}: WavingBannerProps) {
  const pole = chunkyMat(poleColor, { roughness: 1 });
  const finial = chunkyMat(finialColor, { roughness: 0.5, metalness: 0.35 });
  const bracket = chunkyMat([0.20, 0.18, 0.16], { roughness: 0.9 });

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    drawBannerPattern(ctx, pattern, canvas.width, canvas.height);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 4;
    return tex;
  }, [pattern]);

  useEffect(() => () => texture.dispose(), [texture]);

  const flagGeo = useMemo(() => new THREE.PlaneGeometry(width, height, 12, 5), [height, width]);
  const restPositions = useMemo(() => Float32Array.from(flagGeo.attributes.position.array as Float32Array), [flagGeo]);
  const flagMat = useMemo(() => new THREE.MeshStandardMaterial({
    map: texture,
    side: THREE.DoubleSide,
    flatShading: true,
    roughness: 1,
  }), [texture]);
  useEffect(() => () => {
    flagGeo.dispose();
    flagMat.dispose();
  }, [flagGeo, flagMat]);

  const flagRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const mesh = flagRef.current;
    if (!mesh) return;
    const pos = mesh.geometry.attributes.position as THREE.BufferAttribute;
    const t = clock.elapsedTime + phase;
    const halfW = width * 0.5;
    for (let i = 0; i < pos.count; i++) {
      const rx = restPositions[i * 3];
      const ry = restPositions[i * 3 + 1];
      const xNorm = (rx + halfW) / width;
      const xCube = xNorm * xNorm * xNorm;
      const wave = Math.sin(t * speed + rx * 3.4) * amplitude * xNorm;
      const flutter = Math.sin(t * (speed * 1.8) + rx * 6.5 + ry * 2.5) * amplitude * 0.35 * xCube;
      pos.setX(i, rx);
      pos.setY(i, ry - xCube * height * 0.05);
      pos.setZ(i, wave + flutter);
    }
    pos.needsUpdate = true;
  });

  return (
    <group position={position as [number, number, number]} rotation={[0, rotationY, 0]}>
      <mesh position={[0, poleHeight * 0.5, 0]} material={pole}>
        <cylinderGeometry args={[poleRadius * 0.85, poleRadius, poleHeight, 6]} />
      </mesh>
      <mesh position={[0, 0.18, 0]} material={bracket}>
        <boxGeometry args={[poleRadius * 3.2, 0.36, poleRadius * 3.2]} />
      </mesh>
      <mesh position={[0, poleHeight + 0.18, 0]} material={finial}>
        <coneGeometry args={[poleRadius * 1.5, 0.4, 6]} />
      </mesh>
      <mesh
        ref={flagRef}
        position={[width * 0.5, poleHeight * 0.72, 0]}
        geometry={flagGeo}
        material={flagMat}
      />
    </group>
  );
}
