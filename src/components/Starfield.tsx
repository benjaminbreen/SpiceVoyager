import { useEffect, useRef } from 'react';

interface StarfieldProps {
  /** Real-world latitude of the port (deg). Positive = north. Drives which
   *  constellations are visible. Pass null to scatter stars without anchors. */
  latitude: number | null;
  /** Game day count, used to phase the moon (full moon every ~29 days). */
  dayCount: number;
  /** 0..1 scrub for the slow rise/set animation of the whole night sky. */
  progress?: number;
}

interface Star {
  x: number;        // 0..1
  y: number;        // 0..1 (within sky region)
  size: 1 | 2 | 3;  // pixel-art size
  brightness: number;  // base 0..1
  twinkle: number;     // phase offset
  twinkleSpeed: number;
}

interface ShootingStar {
  startTime: number;
  duration: number;    // seconds
  x: number; y: number;     // start
  dx: number; dy: number;   // direction (normalized)
}

interface Constellation {
  name: string;
  // Anchor relative to canvas (0..1), with size multiplier on the layout
  anchor: { x: number; y: number };
  scale: number;
  // Each star is offset from anchor in normalized units, with brightness 0..1
  stars: { x: number; y: number; b: number }[];
  // Lines connecting star indices
  lines: [number, number][];
}

// Polaris + Big Dipper (Ursa Major). Visible in northern hemisphere.
function ursaMajor(anchorX: number, anchorY: number, scale: number): Constellation {
  return {
    name: 'Ursa Major',
    anchor: { x: anchorX, y: anchorY },
    scale,
    stars: [
      { x:  0.00, y:  0.00, b: 0.9 },  // Dubhe
      { x:  0.06, y:  0.04, b: 0.9 },  // Merak
      { x:  0.13, y:  0.05, b: 0.85 }, // Phecda
      { x:  0.18, y:  0.00, b: 0.7 },  // Megrez
      { x:  0.26, y: -0.02, b: 0.85 }, // Alioth
      { x:  0.33, y: -0.03, b: 0.85 }, // Mizar
      { x:  0.40, y: -0.06, b: 0.9 },  // Alkaid
    ],
    lines: [[0,1],[1,2],[2,3],[3,0],[3,4],[4,5],[5,6]],
  };
}

function polarisStar(anchorX: number, anchorY: number): Constellation {
  return {
    name: 'Polaris',
    anchor: { x: anchorX, y: anchorY },
    scale: 1,
    stars: [{ x: 0, y: 0, b: 1.0 }],
    lines: [],
  };
}

// Crux (Southern Cross). Visible in southern hemisphere.
function crux(anchorX: number, anchorY: number, scale: number): Constellation {
  return {
    name: 'Crux',
    anchor: { x: anchorX, y: anchorY },
    scale,
    stars: [
      { x:  0.00, y: -0.05, b: 0.95 }, // Acrux (top)
      { x:  0.00, y:  0.05, b: 0.9 },  // Gacrux (bottom)
      { x: -0.04, y:  0.00, b: 0.85 }, // Becrux (left)
      { x:  0.04, y:  0.00, b: 0.8 },  // Decrux (right)
    ],
    lines: [[0,1],[2,3]],
  };
}

// Orion's Belt — visible from most of the world, anchors equatorial sky.
function orion(anchorX: number, anchorY: number, scale: number): Constellation {
  return {
    name: 'Orion',
    anchor: { x: anchorX, y: anchorY },
    scale,
    stars: [
      { x: -0.03, y:  0.00, b: 0.9 },  // Alnitak
      { x:  0.00, y:  0.00, b: 0.9 },  // Alnilam
      { x:  0.03, y:  0.00, b: 0.9 },  // Mintaka
      { x: -0.07, y: -0.06, b: 0.85 }, // Betelgeuse
      { x:  0.07, y: -0.07, b: 0.85 }, // Bellatrix
      { x: -0.05, y:  0.07, b: 0.85 }, // Saiph
      { x:  0.05, y:  0.06, b: 0.9 },  // Rigel
    ],
    lines: [[0,1],[1,2],[3,1],[4,1],[0,5],[2,6]],
  };
}

function constellationsForLatitude(lat: number | null): Constellation[] {
  if (lat == null) return [];
  const out: Constellation[] = [];
  // Always include Orion when the sky is dark — visible from nearly all
  // inhabited latitudes.
  out.push(orion(0.62, 0.45, 1));

  if (lat > 25) {
    out.push(polarisStar(0.18, 0.18));
    out.push(ursaMajor(0.20, 0.30, 1));
  } else if (lat < -10) {
    out.push(crux(0.25, 0.55, 1));
  } else {
    // Equatorial — both poles are low on the horizon. Faint Polaris if
    // weakly northern; otherwise just ambient stars.
    if (lat > 0) out.push(polarisStar(0.16, 0.40));
    else out.push(crux(0.22, 0.62, 0.9));
  }
  return out;
}

// Moon phase 0..1 (0 = new, 0.5 = full, 1 = back to new).
function moonPhase(dayCount: number): number {
  const cycle = 29.5;
  return ((dayCount % cycle) + cycle) % cycle / cycle;
}

export function Starfield({ latitude, dayCount, progress = 1 }: StarfieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);
  const shootingRef = useRef<ShootingStar | null>(null);
  const cloudPhaseRef = useRef(0);
  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  // Generate stars once per latitude (re-seed when the port changes)
  useEffect(() => {
    const stars: Star[] = [];
    const seed = (latitude ?? 0) * 100 + 1;
    let s = seed;
    const rand = () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
    // Fill the upper ~75% of the canvas with stars
    const count = 220;
    for (let i = 0; i < count; i++) {
      const r = rand();
      stars.push({
        x: rand(),
        y: rand() * 0.75,
        size: r > 0.94 ? 3 : r > 0.7 ? 2 : 1,
        brightness: 0.3 + rand() * 0.7,
        twinkle: rand() * Math.PI * 2,
        twinkleSpeed: 0.3 + rand() * 0.8,
      });
    }
    starsRef.current = stars;
  }, [latitude]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
    };
    resize();
    window.addEventListener('resize', resize);

    const constellations = constellationsForLatitude(latitude);
    const phase = moonPhase(dayCount);
    // 0 = new, 0.5 = full, 1 = new. Illuminated fraction = sin(phase * 2π) variant
    const moonIllum = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
    // Waxing if phase < 0.5: lit on the right. Waning if > 0.5: lit on left.
    const waxing = phase < 0.5;

    const draw = (t: number) => {
      if (startTimeRef.current == null) startTimeRef.current = t;
      const elapsed = (t - startTimeRef.current) / 1000;

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      // Slow drift on stars (sky rotation)
      const drift = elapsed * 1.2;

      // ── Stars ──
      for (const star of starsRef.current) {
        const px = (star.x * w + drift) % w;
        const py = star.y * h;
        const tw = 0.55 + 0.45 * Math.sin(elapsed * star.twinkleSpeed + star.twinkle);
        const a = star.brightness * tw * progress;
        ctx.fillStyle = `rgba(220, 230, 255, ${a})`;
        ctx.fillRect(Math.floor(px), Math.floor(py), star.size, star.size);
      }

      // ── Constellations ──
      for (const c of constellations) {
        const ax = c.anchor.x * w;
        const ay = c.anchor.y * h;
        // Faint connecting lines first
        ctx.strokeStyle = `rgba(180, 200, 240, ${0.10 * progress})`;
        ctx.lineWidth = 1;
        for (const [a, b] of c.lines) {
          const sa = c.stars[a]; const sb = c.stars[b];
          ctx.beginPath();
          ctx.moveTo(ax + sa.x * w * c.scale, ay + sa.y * h * c.scale);
          ctx.lineTo(ax + sb.x * w * c.scale, ay + sb.y * h * c.scale);
          ctx.stroke();
        }
        // Then the named stars on top, slightly brighter
        for (const s of c.stars) {
          const sx = ax + s.x * w * c.scale;
          const sy = ay + s.y * h * c.scale;
          const tw = 0.7 + 0.3 * Math.sin(elapsed * 0.6 + s.x * 12);
          const a = s.b * tw * progress;
          ctx.fillStyle = `rgba(240, 245, 255, ${a})`;
          ctx.fillRect(Math.floor(sx), Math.floor(sy), 2, 2);
          // Soft glow
          ctx.fillStyle = `rgba(200, 220, 255, ${a * 0.25})`;
          ctx.fillRect(Math.floor(sx) - 1, Math.floor(sy) - 1, 4, 4);
        }
      }

      // ── Moon ──
      const moonX = w * 0.82;
      const moonY = h * 0.18;
      const moonR = Math.min(w, h) * 0.04;
      // Disc
      ctx.fillStyle = `rgba(245, 235, 200, ${0.95 * progress})`;
      ctx.beginPath();
      ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
      ctx.fill();
      // Shadow side (cuts the disc into a phase). Drawn as a darker
      // overlapping circle offset away from the lit side.
      if (moonIllum < 0.99) {
        const shadowOffset = moonR * 2 * (1 - moonIllum) * (waxing ? -1 : 1);
        ctx.fillStyle = `rgba(8, 14, 28, 0.95)`;
        ctx.beginPath();
        ctx.arc(moonX + shadowOffset, moonY, moonR * 1.02, 0, Math.PI * 2);
        ctx.fill();
      }
      // Subtle halo
      const haloGrad = ctx.createRadialGradient(moonX, moonY, moonR, moonX, moonY, moonR * 4);
      haloGrad.addColorStop(0, `rgba(245, 235, 200, ${0.15 * moonIllum * progress})`);
      haloGrad.addColorStop(1, 'rgba(245, 235, 200, 0)');
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(moonX, moonY, moonR * 4, 0, Math.PI * 2);
      ctx.fill();

      // ── Drifting clouds (very subtle) ──
      cloudPhaseRef.current = (cloudPhaseRef.current + 0.0008) % 1;
      const cloudOpacity = 0.08 * progress;
      for (let i = 0; i < 3; i++) {
        const cx = ((cloudPhaseRef.current + i * 0.37) % 1) * (w + 200) - 100;
        const cy = h * (0.1 + i * 0.18);
        const cw = w * (0.3 + (i % 2) * 0.15);
        const grad = ctx.createLinearGradient(cx - cw, cy, cx + cw, cy);
        grad.addColorStop(0, 'rgba(40, 50, 80, 0)');
        grad.addColorStop(0.5, `rgba(40, 50, 80, ${cloudOpacity})`);
        grad.addColorStop(1, 'rgba(40, 50, 80, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(cx - cw, cy - 12, cw * 2, 24);
      }

      // ── Shooting star (rare) ──
      if (!shootingRef.current && Math.random() < 0.0008) {
        shootingRef.current = {
          startTime: elapsed,
          duration: 0.8 + Math.random() * 0.4,
          x: Math.random() * 0.7,
          y: Math.random() * 0.4,
          dx: 0.25 + Math.random() * 0.2,
          dy: 0.15 + Math.random() * 0.15,
        };
      }
      if (shootingRef.current) {
        const ss = shootingRef.current;
        const p = (elapsed - ss.startTime) / ss.duration;
        if (p > 1) {
          shootingRef.current = null;
        } else {
          const fade = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
          const x0 = ss.x * w;
          const y0 = ss.y * h;
          const x1 = (ss.x + ss.dx * p) * w;
          const y1 = (ss.y + ss.dy * p) * h;
          // Tail
          ctx.strokeStyle = `rgba(255, 245, 220, ${0.7 * fade * progress})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x0 + (x1 - x0) * Math.max(0, p - 0.15), y0 + (y1 - y0) * Math.max(0, p - 0.15));
          ctx.lineTo(x1, y1);
          ctx.stroke();
          // Head
          ctx.fillStyle = `rgba(255, 250, 230, ${fade * progress})`;
          ctx.fillRect(Math.floor(x1), Math.floor(y1), 2, 2);
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      startTimeRef.current = null;
    };
  }, [latitude, dayCount, progress]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
