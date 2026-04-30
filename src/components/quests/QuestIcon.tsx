// Brass-circle quest icon. Matches the minimap rim aesthetic. Renders a
// Lucide template glyph for v1; swap to a portrait/asset-image later when
// we have NPC portraits or commissioned glyph art.

import { Package, User, Coins, Receipt, Stethoscope } from 'lucide-react';
import type { LeadTemplate } from '../../types/leads';

const TEMPLATE_GLYPH: Record<LeadTemplate, typeof Package> = {
  delivery: Package,
  person: User,
  commodity: Coins,
  debt: Receipt,
  medical: Stethoscope,
};

const BRASS_BG =
  'radial-gradient(circle at 30% 25%, #c9a25a 0%, #8a6a32 35%, #4a3619 75%, #241806 100%)';

const BRASS_SHADOW =
  'inset 0 2px 3px rgba(255,225,160,0.35), inset 0 -2px 4px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.5)';

interface QuestIconProps {
  template: LeadTemplate;
  size?: number;
  /** Faded-out variant for resolved/expired/failed cards. */
  muted?: boolean;
}

export function QuestIcon({ template, size = 48, muted = false }: QuestIconProps) {
  const Glyph = TEMPLATE_GLYPH[template];
  const glyphSize = Math.round(size * 0.46);
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0"
      style={{
        width: size,
        height: size,
        background: BRASS_BG,
        boxShadow: BRASS_SHADOW,
        opacity: muted ? 0.55 : 1,
      }}
    >
      <div
        className="rounded-full flex items-center justify-center"
        style={{
          width: size - 10,
          height: size - 10,
          background: 'radial-gradient(circle at 50% 50%, #1a1208 0%, #0c0904 100%)',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.8), inset 0 -1px 1px rgba(255,200,120,0.05)',
        }}
      >
        <Glyph size={glyphSize} color="#d4b070" strokeWidth={1.6} />
      </div>
    </div>
  );
}
