export const COLORS = {
  hullDefault: '#8B5A2B',
  hullDark: '#5C3A21',
  hullLight: '#A06B3A',
  sail: '#F5F5DC', 
  mast: '#4E342E',
  water1: '#0284C7',
  water2: '#0369A1',
  water3: '#075985',
  waterHighlight: '#38BDF8',
  damage: '#EF4444', 
  damageFire: '#F59E0B',
  sky: '#020617', 
  rigging: '#78716C',
  gold: '#FBBF24',
};

export const LUMA_CHARS = " `.-':_,^=;><+!rc*z?sLTv)J7(|Fi{C}fI31tlu[neoZ5Yxjya]2ESwqkP6h9d4VpOGbUAKXHm8RD#$Bg0MNWQ%&@";

export function getShade(lum: number) {
   let idx = Math.floor(lum * (LUMA_CHARS.length - 1));
   if (idx < 0) idx = 0;
   if (idx >= LUMA_CHARS.length) idx = LUMA_CHARS.length - 1;
   return LUMA_CHARS[idx];
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
            Array.from({ length: width }, () => ({ c: ' ', color: COLORS.sky }))
        );
    }

    draw(x: number, y: number, c: string, color: string, overwrite: boolean = true) {
        x = Math.floor(x);
        y = Math.floor(y);
        if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
            if (overwrite || this.data[y][x].c === ' ') {
                this.data[y][x].c = c;
                this.data[y][x].color = color;
            }
        }
    }
    
    toHTML() {
       let html = `<pre style="background: ${COLORS.sky}; margin:0; color: white; font-family: 'JetBrains Mono', Courier, monospace; font-size: 8px; line-height: 8px; font-weight: 700; padding: 24px; overflow: auto; white-space: pre-wrap; word-break: keep-all; letter-spacing: 0px;">`;
       for (let y = 0; y < this.height; y++) {
           let rowHtml = "";
           let lastColor: string | null = null;
           let currentSpan = "";
           for (let x = 0; x < this.width; x++) {
               let char = this.data[y][x];
               let text = char.c === '<' ? '&lt;' : char.c === '>' ? '&gt;' : char.c === '&' ? '&amp;' : char.c;
               
               if (char.color !== lastColor) {
                   if (lastColor !== null) {
                       rowHtml += `<span style="color:${lastColor}">${currentSpan}</span>`;
                   }
                   lastColor = char.color;
                   currentSpan = text;
               } else {
                   currentSpan += text;
               }
           }
           if (lastColor !== null) {
               rowHtml += `<span style="color:${lastColor}">${currentSpan}</span>`;
           }
           html += rowHtml + "\n";
       }
       html += `</pre>`;
       return html;
    }
    
    toPlainText() {
        let text = "";
        for (let y = 0; y < this.height; y++) {
           for (let x = 0; x < this.width; x++) {
               text += this.data[y][x].c;
           }
           text += "\n";
        }
        return text;
    }
}

export interface DamageConfig {
    bow: number;
    mid: number;
    stern: number;
    foreMast: number;
    mainMast: number;
    aftMast: number;
}

export interface RenderConfig {
    shipType: string;
    damage: DamageConfig;
    wind: number;
    width: number;
    height: number;
}

export function drawSky(ctx: CanvasContext, time: number) {
   for (let i = 0; i < 150; i++) {
       let x = Math.floor(Math.abs(Math.sin(i * 12345)) * ctx.width);
       let y = Math.floor(Math.abs(Math.cos(i * 54321)) * (ctx.height * 0.7));
       let twinkle = Math.sin(time * 0.5 + i) > 0.8;
       let char = twinkle ? '+' : '.';
       let color = twinkle ? '#94A3B8' : '#334155';
       ctx.draw(x, y, char, color, false);
   }
}

export function drawWater(ctx: CanvasContext, config: RenderConfig, time: number) {
    const { width, height } = config;
    const keelY = Math.floor(height * 0.82) - 2;

    for (let y = keelY; y < height; y++) {
        let ty = (y - keelY) / (height - keelY); 
        for (let x = 0; x < width; x++) {
            let wave = Math.sin(x * 0.2 + time * 2.5 + y * 1.5) + Math.cos(x * 0.1 - time * 1.5);
            let char = ' ';
            let color = COLORS.water1;

            if (wave > 1.2) char = '~';
            else if (wave > 0.6) char = '-';
            else if (wave > 0.0) char = '=';
            else if (wave > -0.6) char = '.';

            if (ty < 0.3 && x > width * 0.75) {
               let wake = Math.sin(x * 0.5 - time * 4 - y * 2.0);
               if (wake > 0.5) {
                   char = '~';
                   color = COLORS.waterHighlight;
               }
            }

            if (y > keelY + 3 && char !== ' ') {
                if (wave < 0) color = COLORS.water3;
                else color = COLORS.water2;
            }

            if (char !== ' ') {
                ctx.draw(x, y, char, color, true); 
            }
        }
    }
}
