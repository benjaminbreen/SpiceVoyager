// Simple seeded random for deterministic color variation
export function mulberry32(a: number) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export const BASE_COLORS: Record<string, [number, number, number]> = {
  white: [0.94, 0.94, 0.94],
  mud: [0.76, 0.63, 0.47],
  wood: [0.36, 0.25, 0.20],
  terracotta: [0.80, 0.36, 0.36],
  stone: [0.53, 0.53, 0.53],
  straw: [0.83, 0.75, 0.48],
  tileRoof: [0.80, 0.32, 0.28],
  thatchRoof: [0.78, 0.68, 0.40],
  woodRoof: [0.32, 0.25, 0.20],
  dark: [0.12, 0.10, 0.08],
};

export function varyColor(base: [number, number, number], rng: () => number, amount = 0.08): [number, number, number] {
  return [
    Math.max(0, Math.min(1, base[0] + (rng() - 0.5) * amount)),
    Math.max(0, Math.min(1, base[1] + (rng() - 0.5) * amount)),
    Math.max(0, Math.min(1, base[2] + (rng() - 0.5) * amount)),
  ];
}

export function hashString(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function lerpColor(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, t));
  return [
    a[0] + (b[0] - a[0]) * clamped,
    a[1] + (b[1] - a[1]) * clamped,
    a[2] + (b[2] - a[2]) * clamped,
  ];
}
