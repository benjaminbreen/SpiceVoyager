import * as THREE from 'three';

export interface WorldLabelTexture {
  texture: THREE.CanvasTexture;
  aspect: number;
}

export interface WorldLabelTextureOptions {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  action?: string;
  accent?: string;
  /** Color for the eyebrow text / glow (building variant only). Defaults to a soft purple. */
  eyebrowColor?: string;
  variant?: 'far' | 'mid' | 'near' | 'building';
  compact?: boolean;
}

const SCALE = 8;
const SANS = '"DM Sans", Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif';

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function measureTrackedText(ctx: CanvasRenderingContext2D, text: string, tracking: number) {
  let width = 0;
  for (let i = 0; i < text.length; i++) {
    width += ctx.measureText(text[i]).width;
    if (i < text.length - 1) width += tracking;
  }
  return width;
}

function drawTrackedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
  align: CanvasTextAlign = 'center',
  mode: 'fill' | 'stroke' = 'fill',
) {
  let cursor = x;
  if (align === 'center') cursor -= measureTrackedText(ctx, text, tracking) * 0.5;
  if (align === 'right') cursor -= measureTrackedText(ctx, text, tracking);

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (mode === 'stroke') ctx.strokeText(ch, cursor, y);
    else ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + tracking;
  }
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, fontWeight: number, size: number) {
  let nextSize = size;
  do {
    ctx.font = `${fontWeight} ${nextSize}px ${SANS}`;
    if (ctx.measureText(text).width <= maxWidth || nextSize <= 14) return nextSize;
    nextSize -= 1;
  } while (nextSize > 14);
  return nextSize;
}

function drawGlowText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, tracking: number) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.70)';
  ctx.lineWidth = 7;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 14;
  drawTrackedText(ctx, text, x, y, tracking, 'center', 'stroke');
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.lineWidth = 3;
  drawTrackedText(ctx, text, x, y, tracking, 'center', 'stroke');
  ctx.restore();
}

function drawReadableText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, tracking: number) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(2, 6, 10, 0.58)';
  ctx.lineWidth = 3;
  drawTrackedText(ctx, text, x, y, tracking, 'center', 'stroke');
  ctx.fillStyle = 'rgba(248, 250, 252, 0.98)';
  drawTrackedText(ctx, text, x, y, tracking);
  ctx.restore();
}

function drawBuildingLabel(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  title: string,
  subtitle: string | undefined,
  accent: string,
  eyebrow: string | undefined,
  eyebrowColor: string | undefined,
) {
  const hasSubtitle = Boolean(subtitle);
  const hasEyebrow = Boolean(eyebrow);
  const titleSize = fitText(ctx, title, width - 40, 780, hasSubtitle ? 22 : 24);
  ctx.font = `780 ${titleSize}px ${SANS}`;
  const titleWidth = measureTrackedText(ctx, title, 0);
  const subtitleWidth = subtitle ? measureTrackedText(ctx, subtitle, 0.15) : 0;

  // Eyebrow sits *inside* the panel, above the title. Bump the panel height
  // when present so the eyebrow doesn't push into the top hairline.
  const extraForEyebrow = hasEyebrow ? 16 : 0;
  const panelWidth = Math.min(
    width - 14,
    Math.max(112, titleWidth + 34, subtitleWidth + 40),
  );
  const panelHeight = (hasSubtitle ? 64 : 46) + extraForEyebrow;
  const panelX = (width - panelWidth) * 0.5;
  const panelY = (height - panelHeight) * 0.5;
  const titleY = panelY + extraForEyebrow + (hasSubtitle ? 26 : 30);

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.38)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 4;
  roundedRect(ctx, panelX, panelY, panelWidth, panelHeight, 7);
  ctx.fillStyle = 'rgba(10, 14, 24, 0.72)';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  const gradient = ctx.createLinearGradient(0, panelY, 0, panelY + panelHeight);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.055)');
  gradient.addColorStop(0.52, 'rgba(255, 255, 255, 0.018)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0.08)');
  roundedRect(ctx, panelX, panelY, panelWidth, panelHeight, 7);
  ctx.fillStyle = gradient;
  ctx.fill();

  roundedRect(ctx, panelX + 0.5, panelY + 0.5, panelWidth - 1, panelHeight - 1, 7);
  ctx.strokeStyle = 'rgba(100, 116, 139, 0.34)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Thin gold hairline at top — replaces the heavier accent bar
  ctx.beginPath();
  ctx.moveTo(panelX + 14, panelY + 1.5);
  ctx.lineTo(panelX + panelWidth - 14, panelY + 1.5);
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();

  if (eyebrow) {
    const ey = panelY + 14;
    ctx.save();
    ctx.font = `800 10px ${SANS}`;
    const color = eyebrowColor ?? '#c4a1ff';
    // Soft glow halo
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.fillStyle = color;
    drawTrackedText(ctx, eyebrow.toUpperCase(), width * 0.5, ey, 1.6);
    ctx.shadowBlur = 0;
    // Crisp text on top
    ctx.fillStyle = color;
    drawTrackedText(ctx, eyebrow.toUpperCase(), width * 0.5, ey, 1.6);
    ctx.restore();
  }

  ctx.font = `780 ${titleSize}px ${SANS}`;
  drawReadableText(ctx, title, width * 0.5, titleY, 0);

  if (subtitle) {
    const subtitleY = titleY + 22;
    ctx.font = `650 11px ${SANS}`;
    ctx.save();
    ctx.strokeStyle = 'rgba(2, 6, 10, 0.54)';
    ctx.lineWidth = 3;
    drawTrackedText(ctx, subtitle, width * 0.5, subtitleY, 0.15, 'center', 'stroke');
    ctx.fillStyle = 'rgba(224, 231, 241, 0.86)';
    drawTrackedText(ctx, subtitle, width * 0.5, subtitleY, 0.15);
    ctx.restore();
  }
}

function drawPortLabel(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  title: string,
  eyebrow: string | undefined,
  subtitle: string | undefined,
  action: string | undefined,
) {
  const hasSubtitle = Boolean(subtitle);
  const hasAction = Boolean(action);
  const titleSize = fitText(ctx, title, width - 70, 780, hasAction ? 33 : 36);
  ctx.font = `780 ${titleSize}px ${SANS}`;

  const titleWidth = measureTrackedText(ctx, title, 0);
  const subtitleWidth = subtitle ? measureTrackedText(ctx, subtitle, 0.15) : 0;
  const actionWidth = action ? measureTrackedText(ctx, action, 0.25) : 0;
  const panelWidth = Math.min(
    width - 24,
    Math.max(128, titleWidth + 54, subtitleWidth + 58, actionWidth + 72),
  );
  const panelHeight = hasAction ? 94 : hasSubtitle ? 72 : 50;
  const panelX = (width - panelWidth) * 0.5;
  const panelY = (height - panelHeight) * 0.5 - (hasAction ? 2 : 0);
  const titleY = panelY + (hasAction ? 31 : hasSubtitle ? 30 : 34);

  if (eyebrow) {
    ctx.font = `800 9px ${SANS}`;
    drawGlowText(ctx, eyebrow.toUpperCase(), width * 0.5, 17, 1.4);
    ctx.fillStyle = 'rgba(190, 201, 214, 0.86)';
    drawTrackedText(ctx, eyebrow.toUpperCase(), width * 0.5, 17, 1.4);
  }

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.38)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 4;
  roundedRect(ctx, panelX, panelY, panelWidth, panelHeight, 8);
  ctx.fillStyle = 'rgba(10, 14, 24, 0.68)';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  const gradient = ctx.createLinearGradient(0, panelY, 0, panelY + panelHeight);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.055)');
  gradient.addColorStop(0.52, 'rgba(255, 255, 255, 0.018)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0.08)');
  roundedRect(ctx, panelX, panelY, panelWidth, panelHeight, 8);
  ctx.fillStyle = gradient;
  ctx.fill();

  roundedRect(ctx, panelX + 0.5, panelY + 0.5, panelWidth - 1, panelHeight - 1, 8);
  ctx.strokeStyle = 'rgba(100, 116, 139, 0.34)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(panelX + 12, panelY + 1.5);
  ctx.lineTo(panelX + panelWidth - 12, panelY + 1.5);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.stroke();
  ctx.restore();

  ctx.font = `780 ${titleSize}px ${SANS}`;
  drawReadableText(ctx, title, width * 0.5, titleY, 0);

  if (subtitle) {
    const subtitleY = panelY + 52;
    ctx.font = `650 13px ${SANS}`;
    ctx.save();
    ctx.strokeStyle = 'rgba(2, 6, 10, 0.54)';
    ctx.lineWidth = 3;
    drawTrackedText(ctx, subtitle, width * 0.5, subtitleY, 0.15, 'center', 'stroke');
    ctx.fillStyle = 'rgba(224, 231, 241, 0.88)';
    drawTrackedText(ctx, subtitle, width * 0.5, subtitleY, 0.15);
    ctx.restore();
  }

  if (action) {
    ctx.font = `800 13px ${SANS}`;
    ctx.save();
    ctx.strokeStyle = 'rgba(2, 6, 10, 0.58)';
    ctx.lineWidth = 3;
    drawTrackedText(ctx, action, width * 0.5, panelY + 76, 0.25, 'center', 'stroke');
    ctx.fillStyle = 'rgba(255, 226, 133, 0.94)';
    drawTrackedText(ctx, action, width * 0.5, panelY + 76, 0.25);
    ctx.restore();
  }
}

export function worldHeightForScreenPixels(
  camera: THREE.Camera,
  viewportHeight: number,
  worldPosition: THREE.Vector3,
  pixels: number,
) {
  if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
    const perspective = camera as THREE.PerspectiveCamera;
    const distance = perspective.position.distanceTo(worldPosition);
    const fov = THREE.MathUtils.degToRad(perspective.fov);
    const visibleHeight = (2 * Math.tan(fov * 0.5) * distance) / perspective.zoom;
    return visibleHeight * (pixels / viewportHeight);
  }

  if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
    const ortho = camera as THREE.OrthographicCamera;
    const visibleHeight = (ortho.top - ortho.bottom) / ortho.zoom;
    return visibleHeight * (pixels / viewportHeight);
  }

  return pixels / Math.max(1, viewportHeight);
}

export function createWorldLabelTexture(options: WorldLabelTextureOptions): WorldLabelTexture {
  const variant = options.variant ?? (options.compact ? 'far' : options.action ? 'near' : 'building');
  const isBuilding = variant === 'building';
  const hasEyebrow = Boolean(options.eyebrow);
  const width = isBuilding ? 286 : variant === 'near' ? 332 : variant === 'mid' ? 320 : 300;
  const height = isBuilding
    ? (hasEyebrow ? 104 : 84)
    : variant === 'near' ? 118 : variant === 'mid' ? 112 : 96;
  const canvas = document.createElement('canvas');
  canvas.width = width * SCALE;
  canvas.height = height * SCALE;

  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // textRendering isn't in lib.dom typings yet but Chrome/Safari honour it.
  (ctx as unknown as { textRendering?: string }).textRendering = 'geometricPrecision';
  ctx.scale(SCALE, SCALE);
  ctx.clearRect(0, 0, width, height);

  const accent = options.accent ?? '#c9a84c';

  if (isBuilding) {
    drawBuildingLabel(ctx, width, height, options.title, options.subtitle, accent, options.eyebrow, options.eyebrowColor);
  } else {
    drawPortLabel(ctx, width, height, options.title, options.eyebrow, options.subtitle, options.action);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  // Three clamps to the hardware max, so 16 is safe on any GPU.
  texture.anisotropy = 16;
  texture.needsUpdate = true;

  return { texture, aspect: width / height };
}
