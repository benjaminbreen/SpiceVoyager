import * as THREE from 'three';
import type { WaterPaletteId } from './waterPalettes';

/** Shift a hex color's HSL to match the current climate palette.
 *  Tropical is the baseline — other climates desaturate and hue-shift. */
export function tintVegetation(baseHex: string, paletteId: WaterPaletteId): string {
  const col = new THREE.Color(baseHex);
  const hsl = { h: 0, s: 0, l: 0 };
  col.getHSL(hsl);
  switch (paletteId) {
    case 'temperate':
      hsl.s *= 0.60; hsl.l = hsl.l * 0.96 + 0.04; hsl.h += 0.02; break;
    case 'arid':
      hsl.s *= 0.70; hsl.h -= 0.03; break;
    case 'mediterranean':
      hsl.s *= 0.78; hsl.h -= 0.01; hsl.l *= 1.02; break;
    case 'monsoon':
      hsl.s *= 0.88; hsl.l *= 0.92; break;
    case 'tropical': default: break;
  }
  col.setHSL(hsl.h, Math.min(1, hsl.s), Math.min(1, hsl.l));
  return '#' + col.getHexString();
}
