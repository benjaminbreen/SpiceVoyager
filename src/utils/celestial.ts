import * as THREE from 'three';

export function getClockSunDirection(timeOfDay: number, out = new THREE.Vector3()): THREE.Vector3 {
  const angle = ((timeOfDay - 6) / 24) * Math.PI * 2;
  return out.set(Math.cos(angle) * 0.7, Math.sin(angle), -0.7).normalize();
}

export function createSunDiskTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0.00, 'rgba(255, 248, 220, 1.00)');
  g.addColorStop(0.10, 'rgba(255, 230, 170, 0.95)');
  g.addColorStop(0.28, 'rgba(255, 180, 100, 0.55)');
  g.addColorStop(0.55, 'rgba(255, 130, 60, 0.18)');
  g.addColorStop(1.00, 'rgba(255, 110, 40, 0.00)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createMoonDiskTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;

  const halo = ctx.createRadialGradient(128, 128, 40, 128, 128, 128);
  halo.addColorStop(0, 'rgba(225, 230, 240, 0.18)');
  halo.addColorStop(1, 'rgba(225, 230, 240, 0.00)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, 256, 256);

  const disk = ctx.createRadialGradient(118, 118, 4, 128, 128, 56);
  disk.addColorStop(0.00, 'rgba(252, 248, 238, 1.00)');
  disk.addColorStop(0.65, 'rgba(225, 220, 210, 0.95)');
  disk.addColorStop(1.00, 'rgba(180, 178, 170, 0.00)');
  ctx.fillStyle = disk;
  ctx.beginPath();
  ctx.arc(128, 128, 56, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(170, 170, 165, 0.18)';
  ctx.beginPath(); ctx.arc(140, 132, 10, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(118, 142, 7, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(135, 118, 5, 0, Math.PI * 2); ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
