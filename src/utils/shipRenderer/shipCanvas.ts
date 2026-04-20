// ASCII canvas + shared palette for the ship renderer.
// Ported and adapted from the standalone ascii-shipwright prototype.

export const COLORS = {
  hullDefault: '#8B5A2B',
  hullDark: '#5C3A21',
  hullLight: '#A06B3A',
  hullOutline: '#C69664',
  sail: '#FAFAF5',
  sailShadow: '#D8D6C8',
  mast: '#4E342E',
  water1: '#0284C7',
  water2: '#0369A1',
  water3: '#075985',
  waterHighlight: '#38BDF8',
  damage: '#EF4444',
  damageFire: '#F59E0B',
  sky: 'transparent',
  rigging: '#78716C',
  gold: '#FBBF24',

  // Cutaway-only
  deckLine: '#B08968',
  bulkhead: '#8A6A48',
  cargoCrate: '#B45309',
  cargoBarrel: '#A16207',
  cargoBale: '#7E5A1F',
  berthEmpty: '#6B6357',
  berthFull: '#D4B483',
  powder: '#F87171',
  bilge: '#1E3A5F',
  galley: '#EA580C',
  captain: '#FBBF24',
  labelDim: '#9CA3AF',
};

export const LUMA_CHARS =
  " `.-':_,^=;><+!rc*z?sLTv)J7(|Fi{C}fI31tlu[neoZ5Yxjya]2ESwqkP6h9d4VpOGbUAKXHm8RD#$Bg0MNWQ%&@";

export function getShade(lum: number): string {
  let idx = Math.floor(lum * (LUMA_CHARS.length - 1));
  if (idx < 0) idx = 0;
  if (idx >= LUMA_CHARS.length) idx = LUMA_CHARS.length - 1;
  return LUMA_CHARS[idx];
}

// Narrow, distinct shade palettes — using the full LUMA ramp everywhere
// blends sails and hull into a single noisy blob. These give each surface
// a characteristic texture.

// Hull: planks are dark & solid. Darker → denser glyph.
const HULL_SHADES = [' ', '.', ':', '~', '=', '#', '%', '@'];
export function getHullShade(lum: number): string {
  const idx = Math.max(0, Math.min(HULL_SHADES.length - 1, Math.floor(lum * HULL_SHADES.length)));
  return HULL_SHADES[idx];
}

// Sails: linen canvas — dense, light block chars only, so sails read as
// solid fabric rather than speckled shading. No sparse glyphs or empty
// spaces; narrow tonal range keeps them near-white with only a hint of
// shadow on the lee side.
const SAIL_SHADES = ['▒', '▓', '▓', '█'];
export function getSailShade(lum: number): string {
  const idx = Math.max(0, Math.min(SAIL_SHADES.length - 1, Math.floor(lum * SAIL_SHADES.length)));
  return SAIL_SHADES[idx];
}

export type ASCIIChar = { c: string; color: string };

export class CanvasContext {
  width: number;
  height: number;
  data: ASCIIChar[][];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = Array.from({ length: height }, () =>
      Array.from({ length: width }, () => ({ c: ' ', color: 'transparent' }))
    );
  }

  clear() {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.data[y][x].c = ' ';
        this.data[y][x].color = 'transparent';
      }
    }
  }

  draw(x: number, y: number, c: string, color: string, overwrite = true) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    if (overwrite || this.data[y][x].c === ' ') {
      this.data[y][x].c = c;
      this.data[y][x].color = color;
    }
  }

  toHTML(bg: string = 'transparent'): string {
    let html = `<pre style="background:${bg};margin:0;color:#fff;font-family:'JetBrains Mono','SF Mono',Consolas,monospace;font-size:inherit;line-height:1;font-weight:700;padding:0;white-space:pre;letter-spacing:0px;">`;
    for (let y = 0; y < this.height; y++) {
      let rowHtml = '';
      let lastColor: string | null = null;
      let run = '';
      for (let x = 0; x < this.width; x++) {
        const ch = this.data[y][x];
        const text =
          ch.c === '<' ? '&lt;' : ch.c === '>' ? '&gt;' : ch.c === '&' ? '&amp;' : ch.c;
        if (ch.color !== lastColor) {
          if (lastColor !== null) {
            rowHtml += `<span style="color:${lastColor}">${run}</span>`;
          }
          lastColor = ch.color;
          run = text;
        } else {
          run += text;
        }
      }
      if (lastColor !== null) rowHtml += `<span style="color:${lastColor}">${run}</span>`;
      html += rowHtml + '\n';
    }
    html += `</pre>`;
    return html;
  }
}
