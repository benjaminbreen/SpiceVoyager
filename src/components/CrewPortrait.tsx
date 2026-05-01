/**
 * CrewPortrait — Procedural SVG portrait generator for crew members.
 *
 * Generates deterministic, characterful portraits from CrewMember data.
 * Every face is unique but consistent: the same crew member always looks the same.
 *
 * Supports all 19 nationalities with culturally appropriate clothing, headwear,
 * facial hair, and accessories for the c. 1612 Indian Ocean setting.
 */

import React, { useMemo } from 'react';
import type { CrewMember, HealthFlag } from '../store/gameStore';
import {
  mulberry32,
  crewToPortraitConfig,
  tavernNpcToPortraitConfig,
  getSkin,
  getEyeColor,
  getHairColor,
  type PortraitConfig,
  type SkinPalette,
  type Personality,
  type SocialClass,
  type TavernNpcPortraitInput,
} from '../utils/portraitConfig';

// Re-export for modal use
export { crewToPortraitConfig, tavernNpcToPortraitConfig, getSkin, getEyeColor, getHairColor } from '../utils/portraitConfig';
export type { PortraitConfig, TavernNpcPortraitInput } from '../utils/portraitConfig';

// ── Public component ─────────────────────────────────────

interface CrewPortraitProps {
  member: CrewMember;
  size?: number;
  className?: string;
  showBackground?: boolean;
  expressionOverride?: Personality | null;
}

export function CrewPortrait({ member, size = 64, className = '', showBackground = true, expressionOverride }: CrewPortraitProps) {
  const portrait = useMemo(() => {
    const config = crewToPortraitConfig(member);
    if (expressionOverride) config.personality = expressionOverride;
    return renderPortrait(config, showBackground, member.morale, member.health);
  }, [member.id, member.name, member.role, member.quality, member.morale, member.health, showBackground, expressionOverride]);

  return (
    <svg
      viewBox="0 0 200 250"
      width={size}
      height={size * 1.25}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      {portrait}
    </svg>
  );
}

// Compact square version for crew rows — zoomed into head
export function CrewPortraitSquare({ member, size = 32, className = '', expressionOverride }: Omit<CrewPortraitProps, 'showBackground'>) {
  const portrait = useMemo(() => {
    const config = crewToPortraitConfig(member);
    if (expressionOverride) config.personality = expressionOverride;
    const showBg = config.role === 'Captain'; // captains get flag background even in compact view
    return renderPortrait(config, showBg, member.morale, member.health);
  }, [member.id, member.name, member.role, member.quality, member.morale, member.health, expressionOverride]);

  return (
    <svg
      viewBox="25 20 150 150"
      width={size}
      height={size}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      {portrait}
    </svg>
  );
}

// ── Config-based portrait (for tavern NPCs etc.) ────────

interface ConfigPortraitProps {
  config: PortraitConfig;
  size?: number;
  className?: string;
  showBackground?: boolean;
  square?: boolean;
}

export function ConfigPortrait({ config, size = 64, className = '', showBackground = false, square = false }: ConfigPortraitProps) {
  const portrait = useMemo(() => renderPortrait(config, showBackground), [config.seed, showBackground]);

  return (
    <svg
      viewBox={square ? '25 20 150 150' : '0 0 200 250'}
      width={size}
      height={square ? size : size * 1.25}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      {portrait}
    </svg>
  );
}

// ── Core renderer ────────────────────────────────────────

function renderPortrait(config: PortraitConfig, showBg: boolean, morale?: number, health?: HealthFlag): React.ReactNode {
  const rng = mulberry32(config.seed);
  const skin = getSkin(config);
  const eyeColor = getEyeColor(config);
  const hairColor = getHairColor(config);

  // ── Face shape archetype → head proportions ──
  // Each archetype sets baseline ratios, then individual RNG adds small variation
  let baseHeadWidth: number, baseJawRatio: number, baseJawLength: number, baseForeheadH: number, baseCheekExtra: number;
  switch (config.faceShape) {
    case 'round':   baseHeadWidth = 44; baseJawRatio = 0.88; baseJawLength = 52; baseForeheadH = 10; baseCheekExtra = 5; break;
    case 'oval':    baseHeadWidth = 40; baseJawRatio = 0.78; baseJawLength = 58; baseForeheadH = 10; baseCheekExtra = 3; break;
    case 'long':    baseHeadWidth = 35; baseJawRatio = 0.72; baseJawLength = 66; baseForeheadH = 13; baseCheekExtra = 1; break;
    case 'square':  baseHeadWidth = 44; baseJawRatio = 0.92; baseJawLength = 56; baseForeheadH = 8;  baseCheekExtra = 2; break;
    case 'heart':   baseHeadWidth = 42; baseJawRatio = 0.62; baseJawLength = 58; baseForeheadH = 11; baseCheekExtra = 5; break;
    case 'diamond': baseHeadWidth = 38; baseJawRatio = 0.68; baseJawLength = 60; baseForeheadH = 12; baseCheekExtra = 7; break;
  }
  const headWidth = baseHeadWidth + (rng() - 0.5) * 6;
  const jawWidth = headWidth * baseJawRatio + (rng() - 0.5) * 3;
  const jawLength = baseJawLength + (rng() - 0.5) * 6;
  const foreheadHeight = baseForeheadH + (rng() - 0.5) * 3;
  const cheekWidth = headWidth + baseCheekExtra + rng() * 2;

  // ── Eyes (large, expressive — Stardew-style) ──
  const eyeSpacing = 17 + rng() * 5;                 // 17–22, allows wide-set and close-set
  const eyeY = 100 + (rng() - 0.5) * 3;
  const eyeHeight = 6 + rng() * 8;                   // 6–14, substantially bigger
  const eyeWidth = 18 + rng() * 10;                  // 18–28, wider range
  const eyeSlant = (rng() - 0.5) * 5;                // -2.5 to +2.5
  const eyeLidWeight = 0.1 + rng() * 0.5;             // 0.1–0.6, less lid coverage to show more eye
  // Eye shape type — controls how round vs almond vs droopy the eye is
  const eyeShapeRoll = rng();
  const eyeShape: 'round' | 'almond' | 'droopy' | 'wide' | 'hooded' =
    eyeShapeRoll < 0.2 ? 'round' :
    eyeShapeRoll < 0.45 ? 'almond' :
    eyeShapeRoll < 0.6 ? 'wide' :
    eyeShapeRoll < 0.8 ? 'hooded' : 'droopy';
  const gazeOffsetX = (rng() - 0.5) * 2.5;           // iris shift left/right — makes eyes feel alive
  const gazeOffsetY = rng() * 1.5;                    // iris shift slightly down (never up — looks unnatural)

  const isEastAsian = config.culturalGroup === 'EastAsian';
  const isSEAsian = config.culturalGroup === 'SoutheastAsian';
  const epicanthicFold = isEastAsian ? 2 + rng() * 1.5 : isSEAsian ? rng() * 1.5 : 0;

  // ── Nose ──
  const noseWidth = 6 + rng() * 10;                  // 6–16, button to broad
  const noseBridge = 3 + rng() * 3;
  const noseLength = 16 + rng() * 12;                // 16–28, short to long aquiline
  const noseTip = (rng() - 0.5) * 4;
  const noseCurve = (rng() - 0.5) * 3;

  const noseWiden = config.culturalGroup === 'Swahili' ? 3 + rng() * 2 :
                    config.culturalGroup === 'Indian' ? rng() * 2.5 :
                    config.culturalGroup === 'SoutheastAsian' ? rng() * 2 : 0;
  const effNoseWidth = noseWidth + noseWiden;

  // ── Mouth (bolder, more readable at small sizes) ──
  // Half-width — total mouth span is 2x this. Scaled to head size so mouths don't outgrow the face.
  const mouthWidth = 10 + rng() * 5;                 // 10–15 half-width → 20–30 total
  const mouthY = eyeY + noseLength + 16 + (rng() - 0.5) * 3;
  const upperLip = 2.5 + rng() * 5;                  // 2.5–7.5
  const lowerLip = 3 + rng() * 7;                    // 3–10

  const lipBoost = config.culturalGroup === 'Swahili' ? 2 + rng() * 2 :
                   config.culturalGroup === 'Indian' ? rng() * 1.2 :
                   config.culturalGroup === 'SoutheastAsian' ? rng() * 1 : 0;
  const lipFullness = 0.5 + rng() * 0.7;             // 0.5 = thin/taut, 1.2 = full/rounded
  const effUpperLip = (upperLip + lipBoost * 0.7) * lipFullness;
  const effLowerLip = (lowerLip + lipBoost) * lipFullness;

  // ── Ears ──
  const earSize = 8 + rng() * 5;
  const earAttach = eyeY + (rng() - 0.5) * 4;

  // ── Chin details ──
  const chinCleft = rng() > 0.7 ? 1 + rng() * 1.5 : 0;
  const philtrumDepth = 0.5 + rng() * 1;

  // ── Expression (wider range for readability) ──
  let mouthCurve = (rng() - 0.5) * 3;
  let mouthAsym = (rng() - 0.5) * 1.5;
  let browInnerL = 0, browOuterL = 0, browInnerR = 0, browOuterR = 0;

  applyPersonality(config.personality, rng, {
    setMouthCurve: (v: number) => { mouthCurve = v; },
    setMouthAsym: (v: number) => { mouthAsym = v; },
    setBrowL: (i: number, o: number) => { browInnerL = i; browOuterL = o; },
    setBrowR: (i: number, o: number) => { browInnerR = i; browOuterR = o; },
  });

  // Morale-based expression nudges — only at extremes, blends with base personality
  if (morale !== undefined) {
    if (morale <= 15) {
      // Miserable: angry frown, furrowed brows
      mouthCurve = Math.max(mouthCurve, 2.5);
      browInnerL += 3; browInnerR += 3;
      browOuterL -= 2; browOuterR -= 2;
    } else if (morale < 25) {
      // Unhappy: slight downturn, tenser brows
      mouthCurve += 1.2;
      browInnerL += 1.5; browInnerR += 1.5;
    } else if (morale >= 95) {
      // Elated: broad smile, relaxed lifted brows
      mouthCurve = Math.min(mouthCurve, -3);
      browInnerL -= 2; browInnerR -= 2;
      browOuterL += 1.5; browOuterR += 1.5;
    } else if (morale >= 85) {
      // Content: gentle upturn, slightly relaxed brows
      mouthCurve -= 1.2;
      browInnerL -= 1; browInnerR -= 1;
    }
  }

  // ── Age ──
  const ageIdx = ['20s', '30s', '40s', '50s', '60s'].indexOf(config.age);
  // Wrinkle alpha ramps harder past 40s — 30s: 0.12, 40s: 0.30, 50s: 0.52, 60s: 0.72.
  const wrinkleAlpha = ageIdx <= 0 ? 0
    : ageIdx === 1 ? 0.12
    : ageIdx === 2 ? 0.30
    : ageIdx === 3 ? 0.52
    : 0.72;
  const jowlSag = ageIdx >= 3 ? (ageIdx - 2) * 1.5 : 0;
  const underEyeBags = ageIdx >= 2 ? (ageIdx - 1) * 0.08 : 0;

  // ── Skin texture ──
  // Outdoor/older crew get coarser, more visible skin texture
  const isOutdoorRole = config.role === 'Sailor' || config.role === 'Gunner' || config.role === 'Captain';
  const skinRoughness = 0.02 + ageIdx * 0.008 + (isOutdoorRole ? 0.008 : 0) + rng() * 0.01;
  const skinTextureOpacity = 0.06 + ageIdx * 0.03 + (isOutdoorRole ? 0.025 : 0);
  const skinTextureSeed = Math.floor(rng() * 9999);  // unique noise per portrait

  // ── Facial asymmetry (lived-in, not malformed) ──
  // Derived from a sub-stream so existing feature rolls stay stable.
  // Scars, broken noses, and old age amplify asymmetry; young clean faces get only a hair of it.
  const asymRng = mulberry32(config.seed ^ 0x9E3779B9);
  const asymBoost = (config.isScarred ? 1.6 : 1) * (config.hasBrokenNose ? 1.4 : 1)
    * (ageIdx >= 3 ? 1.3 : 1);
  const eyeYOffsetL = (asymRng() - 0.5) * 1.2 * asymBoost;
  const eyeYOffsetR = (asymRng() - 0.5) * 1.2 * asymBoost;
  const eyeHeightOffsetL = (asymRng() - 0.5) * 1.1 * asymBoost;
  const eyeHeightOffsetR = (asymRng() - 0.5) * 1.1 * asymBoost;
  // Extra brow baseline drift — one brow naturally sits slightly higher than the other.
  const browDriftL = (asymRng() - 0.5) * 1.4 * asymBoost;
  const browDriftR = (asymRng() - 0.5) * 1.4 * asymBoost;

  // ── Layout constants ──
  const cx = 100;
  const headTop = eyeY - 44 - foreheadHeight;
  const chinY = eyeY + jawLength;
  const noseY = eyeY + noseLength;
  const bgColor = getRoleBgColor(config);
  const culturalAccent = getCulturalAccent(config.culturalGroup);
  const uid = `p${Math.abs(config.seed)}`;

  // ── Eye animation: gaze shifts + occasional brow raise ──
  // Low-morale crew get "shifty" eyes — multiple rapid glances per cycle.
  // Normal crew get one slow relaxed glance every 12–18s.
  const moraleLevel = morale ?? 75;
  const anxious = moraleLevel < 25;
  const uneasy = !anxious && moraleLevel < 45;
  const gazeDur = anxious ? 5 + (Math.abs(config.seed) % 300) / 300 * 2
                : uneasy ? 8 + (Math.abs(config.seed) % 400) / 400 * 3
                : 13 + (Math.abs(config.seed) % 800) / 800 * 6;
  const gazeDelay = (Math.abs(config.seed + 17) % 1000) / 1000 * 3;
  const amp = anxious ? 2.8 : uneasy ? 2.2 : 1.8;
  let gazeKeyframes: string;
  if (anxious) {
    gazeKeyframes = `
      0%, 8%, 100% { transform: translateX(0); }
      12%, 18% { transform: translateX(-${amp}px); }
      22%, 28% { transform: translateX(0); }
      32%, 38% { transform: translateX(${amp}px); }
      42%, 48% { transform: translateX(0); }
      55%, 62% { transform: translateX(-${(amp * 0.85).toFixed(2)}px); }
      68%, 74% { transform: translateX(0); }
      82%, 88% { transform: translateX(${(amp * 0.9).toFixed(2)}px); }
    `;
  } else if (uneasy) {
    gazeKeyframes = `
      0%, 18%, 100% { transform: translateX(0); }
      24%, 32% { transform: translateX(-${amp}px); }
      38%, 46% { transform: translateX(0); }
      58%, 66% { transform: translateX(${amp}px); }
      72%, 80% { transform: translateX(0); }
    `;
  } else {
    const gazeSide = (config.seed & 1) ? 1 : -1;
    gazeKeyframes = `
      0%, 38%, 100% { transform: translateX(0); }
      46%, 56% { transform: translateX(${gazeSide * amp}px); }
      64%, 74% { transform: translateX(0); }
    `;
  }
  const gazeAnim = `gaze-${uid} ${gazeDur.toFixed(2)}s ease-in-out ${gazeDelay.toFixed(2)}s infinite`;

  // Brow raise — occasional single-brow lift. Curious/Smug get it reliably;
  // others get it rarely. Low-morale crew don't raise brows (they furrow instead).
  const browLift = !anxious && (config.personality === 'Curious' || config.personality === 'Smug'
    || (Math.abs(config.seed) % 100) < 18);
  const browDur = 7 + (Math.abs(config.seed + 42) % 600) / 600 * 5;
  const browDelay = (Math.abs(config.seed + 73) % 1000) / 1000 * 4;
  const browKeyframes = `
    0%, 22%, 40%, 100% { transform: translateY(0); }
    26%, 33% { transform: translateY(-1.8px); }
  `;
  const browAnim = browLift ? `brow-${uid} ${browDur.toFixed(2)}s ease-in-out ${browDelay.toFixed(2)}s infinite` : '';

  // ── Idle head sway — very slow ±0.4° rotation so static portraits feel alive ──
  const swayAmp = 0.35 + (Math.abs(config.seed) % 100) / 100 * 0.25;    // 0.35–0.60°
  const swayDur = 16 + (Math.abs(config.seed + 29) % 1000) / 1000 * 10;  // 16–26s
  const swayDelay = (Math.abs(config.seed + 131) % 1000) / 1000 * 6;
  const swayDir = (config.seed & 4) ? 1 : -1;
  const swayKeyframes = `
    0%, 100% { transform: rotate(${(-swayAmp * swayDir).toFixed(2)}deg); }
    50%      { transform: rotate(${(swayAmp * swayDir).toFixed(2)}deg); }
  `;
  const swayAnim = `sway-${uid} ${swayDur.toFixed(2)}s ease-in-out ${swayDelay.toFixed(2)}s infinite`;

  // ── Health tint ── applies over the face before hair/hat, so illness reads as skin, not costume.
  // Each flag carries a color wash and optional specular for fevered foreheads.
  let healthTint: { color: string; opacity: number; shineOpacity: number } | null = null;
  switch (health) {
    case 'fevered':  healthTint = { color: '#c43028', opacity: 0.14, shineOpacity: 0.22 }; break;  // flushed + sweaty
    case 'sick':     healthTint = { color: '#6a7a3a', opacity: 0.10, shineOpacity: 0 }; break;      // greenish pallor
    case 'scurvy':   healthTint = { color: '#b89a3a', opacity: 0.13, shineOpacity: 0 }; break;      // sallow yellow
    case 'injured':  healthTint = { color: '#8890a0', opacity: 0.11, shineOpacity: 0 }; break;      // ashen/pale
    default: break;
  }

  // ── Chiaroscuro: directional light from one side ──
  // Light comes from upper-left or upper-right, like a candle or window
  const lightSide = rng() > 0.5 ? 1 : -1; // 1 = light from right, -1 = from left
  const lightIntensity = 0.7 + rng() * 0.3; // how dramatic the contrast is

  // Light source position (percentage coordinates for gradient)
  const lightX = lightSide > 0 ? '72%' : '28%';
  const shadowX = lightSide > 0 ? '15%' : '85%';

  return (
    <g>
      <defs>
        {/* Main skin: off-center radial gradient simulating directional light */}
        <radialGradient id={`skin-${uid}`} cx={lightX} cy="35%" r="65%" fx={lightX} fy="33%">
          <stop offset="0%" stopColor={skin.light} />
          <stop offset="40%" stopColor={skin.mid} />
          <stop offset="80%" stopColor={skin.dark} />
          <stop offset="100%" stopColor={skin.dark} />
        </radialGradient>

        {/* Deep shadow on the opposite side of the light — the Rembrandt shadow */}
        <linearGradient id={`shadow-${uid}`}
          x1={lightSide > 0 ? '0%' : '100%'} y1="20%"
          x2={lightSide > 0 ? '70%' : '30%'} y2="80%">
          <stop offset="0%" stopColor={`rgba(0,0,0,${0.22 * lightIntensity})`} />
          <stop offset="50%" stopColor="rgba(0,0,0,0.02)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </linearGradient>

        {/* Warm highlight on lit side — golden candlelight feel */}
        <linearGradient id={`highlight-${uid}`}
          x1={lightSide > 0 ? '100%' : '0%'} y1="15%"
          x2={lightSide > 0 ? '30%' : '70%'} y2="70%">
          <stop offset="0%" stopColor={`rgba(255,230,180,${0.15 * lightIntensity})`} />
          <stop offset="40%" stopColor="rgba(255,230,180,0.03)" />
          <stop offset="100%" stopColor="rgba(255,230,180,0)" />
        </linearGradient>

        {/* Background: warm vignette with dark edges */}
        <radialGradient id={`bg-${uid}`} cx={lightX} cy="40%" r="70%">
          <stop offset="0%" stopColor={bgColor} />
          <stop offset="60%" stopColor={bgColor} />
          <stop offset="100%" stopColor="#040406" />
        </radialGradient>

        {/* Vignette overlay */}
        <radialGradient id={`vign-${uid}`} cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="rgba(0,0,0,0)" />
          <stop offset="70%" stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.4)" />
        </radialGradient>

        {/* Cultural origin accent — soft radial wash */}
        <radialGradient id={`culture-${uid}`} cx="50%" cy="50%" r="75%">
          <stop offset="0%" stopColor={culturalAccent.color} stopOpacity={culturalAccent.opacity} />
          <stop offset="55%" stopColor={culturalAccent.color} stopOpacity={culturalAccent.opacity * 0.5} />
          <stop offset="100%" stopColor={culturalAccent.color} stopOpacity={0} />
        </radialGradient>

        {/* Skin texture filter — organic noise that breaks up smooth gradients */}
        <filter id={`skinTex-${uid}`} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency={skinRoughness}
            numOctaves={3} seed={skinTextureSeed} result="noise" />
          <feColorMatrix type="saturate" values="0" in="noise" result="grayNoise" />
          <feBlend mode="multiply" in="SourceGraphic" in2="grayNoise" />
        </filter>

        {/* Subtle displacement filter for skin unevenness on weathered faces */}
        {ageIdx >= 2 && (
          <filter id={`skinDisp-${uid}`} x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="turbulence" baseFrequency={0.04 + ageIdx * 0.006}
              numOctaves={2} seed={skinTextureSeed + 1} result="warp" />
            <feDisplacementMap in="SourceGraphic" in2="warp" scale={0.8 + ageIdx * 0.4}
              xChannelSelector="R" yChannelSelector="G" />
          </filter>
        )}
        {/* Blink + gaze-shift + brow-raise animations */}
        <style>{`
          @keyframes blink-${uid} {
            0%, 92%, 100% { transform: scaleY(0); }
            95%, 97% { transform: scaleY(1); }
          }
          @keyframes gaze-${uid} { ${gazeKeyframes} }
          ${browLift ? `@keyframes brow-${uid} { ${browKeyframes} }` : ''}
          @keyframes sway-${uid} { ${swayKeyframes} }
        `}</style>
      </defs>

      {/* Background — captains get their nationality flag, others get gradient */}
      {showBg && config.role === 'Captain' && (
        <g key="bg">
          <rect x="-20" y="-20" width="240" height="290" fill="#000" />
          {renderCaptainFlag(config.nationality, uid)}
        </g>
      )}
      {showBg && config.role !== 'Captain' && (
        <g key="bg">
          <rect width="200" height="250" fill={`url(#bg-${uid})`} />
          <rect width="200" height="250" fill={`url(#culture-${uid})`} />
          <rect width="200" height="250" fill={`url(#vign-${uid})`} />
        </g>
      )}

      {/* Idle sway group — subtle rotation keeps the portrait alive between blinks */}
      <g style={{
        transformOrigin: `${cx}px ${chinY + 30}px`,
        animation: swayAnim,
      }}>

      {/* Back hair */}
      {renderBackHair(config, rng, cx, headTop, headWidth, eyeY, chinY, hairColor)}

      {/* Clothing */}
      {renderClothing(config, rng, cx, chinY, skin)}

      {/* Neck — wider to read as anatomical, not a stem */}
      {(() => {
        const neckPath = `M ${cx - 19} ${chinY - 8} C ${cx - 21} ${chinY + 6}, ${cx - 23} ${chinY + 18}, ${cx - 24} ${chinY + 30} L ${cx + 24} ${chinY + 30} C ${cx + 23} ${chinY + 18}, ${cx + 21} ${chinY + 6}, ${cx + 19} ${chinY - 8} Z`;
        return (
          <g key="neck">
            <path d={neckPath} fill={`url(#skin-${uid})`} />
            <path d={neckPath} fill={`url(#shadow-${uid})`} />
            <path d={neckPath} fill={skin.mid} opacity={skinTextureOpacity * 0.7} filter={`url(#skinTex-${uid})`} />
            {/* Sternocleidomastoid shadow on the dark side — anchors the neck to the body */}
            <path d={`M ${cx - lightSide * 10} ${chinY - 4} Q ${cx - lightSide * 14} ${chinY + 14}, ${cx - lightSide * 18} ${chinY + 28}`}
              stroke={`rgba(0,0,0,${0.08 * lightIntensity})`} strokeWidth="3" fill="none" strokeLinecap="round" />
            {/* Throat shadow under chin */}
            <ellipse cx={cx} cy={chinY + 2} rx={10} ry={3} fill="rgba(0,0,0,0.12)" />
          </g>
        );
      })()}

      {/* Ears */}
      {renderEars(cx, earAttach, headWidth, earSize, skin, uid)}

      {/* Head shape — base skin */}
      <path d={headPath(cx, headTop, eyeY, chinY, headWidth, jawWidth, cheekWidth, foreheadHeight, jowlSag)}
        fill={`url(#skin-${uid})`} />

      {/* Chiaroscuro: deep shadow on dark side */}
      <path d={headPath(cx, headTop, eyeY, chinY, headWidth, jawWidth, cheekWidth, foreheadHeight, jowlSag)}
        fill={`url(#shadow-${uid})`} />

      {/* Chiaroscuro: warm highlight on lit side */}
      <path d={headPath(cx, headTop, eyeY, chinY, headWidth, jawWidth, cheekWidth, foreheadHeight, jowlSag)}
        fill={`url(#highlight-${uid})`} />

      {/* Skin texture — noise overlay for pores/roughness */}
      <path d={headPath(cx, headTop, eyeY, chinY, headWidth, jawWidth, cheekWidth, foreheadHeight, jowlSag)}
        fill={skin.mid} opacity={skinTextureOpacity} filter={`url(#skinTex-${uid})`} />

      {/* Subtle skin displacement for weathered faces (40s+) */}
      {ageIdx >= 2 && (
        <path d={headPath(cx, headTop, eyeY, chinY, headWidth, jawWidth, cheekWidth, foreheadHeight, jowlSag)}
          fill="none" stroke={skin.dark} strokeWidth="0.3" opacity={0.15 + ageIdx * 0.05}
          filter={`url(#skinDisp-${uid})`} />
      )}

      {/* Cheek shading — deeper on shadow side */}
      <ellipse cx={cx - lightSide * headWidth + (lightSide > 0 ? 5 : -5)} cy={eyeY + 18}
        rx={10} ry={22} fill={`rgba(0,0,0,${0.1 * lightIntensity})`} />
      <ellipse cx={cx + lightSide * headWidth + (lightSide > 0 ? -5 : 5)} cy={eyeY + 18}
        rx={7} ry={16} fill="rgba(0,0,0,0.03)" />

      {/* Cheek warmth — stronger on lit side */}
      <ellipse cx={cx + lightSide * (headWidth - 10)} cy={eyeY + 20}
        rx={8} ry={5} fill={skin.blush} opacity={0.12 * lightIntensity} />
      <ellipse cx={cx - lightSide * (headWidth - 12)} cy={eyeY + 22}
        rx={6} ry={4} fill={skin.blush} opacity={0.04} />

      {/* === SPECULAR HIGHLIGHTS === */}
      {/* Forehead highlight — broad soft glow on lit side */}
      <ellipse cx={cx + lightSide * 8} cy={eyeY - 25}
        rx={14} ry={8} fill="rgba(255,248,230,0.12)" opacity={lightIntensity} />

      {/* Nose tip highlight — bright specular point */}
      <ellipse cx={cx + lightSide * 1.5} cy={noseY - 2}
        rx={3} ry={2} fill="rgba(255,250,240,0.2)" opacity={lightIntensity} />

      {/* Nose bridge highlight — narrow streak down the lit side */}
      <path d={`M ${cx + lightSide * 2} ${eyeY + 6} Q ${cx + lightSide * 2.5} ${eyeY + noseLength * 0.5} ${cx + lightSide * 1.5} ${noseY - 4}`}
        stroke="rgba(255,248,230,0.1)" strokeWidth="2" fill="none" strokeLinecap="round" opacity={lightIntensity} />

      {/* Cheekbone highlight — the key Rembrandt highlight */}
      <ellipse cx={cx + lightSide * (headWidth - 8)} cy={eyeY + 10}
        rx={6} ry={4} fill="rgba(255,248,230,0.1)" opacity={lightIntensity}
        transform={`rotate(${lightSide * -15} ${cx + lightSide * (headWidth - 8)} ${eyeY + 10})`} />

      {/* Sun-weathered flush — outdoor crew (sailor/gunner/captain) pick up a ruddy nose bridge
          and cheek apples from wind and sun. Older faces and the "weathered fair" palette
          (skinIndex 14) flush harder; dark-skinned faces show it far less visibly. */}
      {isOutdoorRole && (() => {
        const base = 0.07 + ageIdx * 0.025 + (config.skinIndex === 14 ? 0.09 : 0)
          + (config.skinIndex === 11 ? 0.05 : 0);
        const darkSkin = config.skinIndex >= 6 && config.skinIndex !== 11 && config.skinIndex !== 14;
        const intensity = darkSkin ? base * 0.35 : base;
        if (intensity < 0.04) return null;
        return (
          <g key="sun-wash">
            {/* Nose bridge and tip — where the sun hits hardest */}
            <ellipse cx={cx} cy={eyeY + noseLength * 0.55} rx={effNoseWidth - 1}
              ry={noseLength * 0.38} fill="rgb(186,78,58)" opacity={intensity} />
            <ellipse cx={cx} cy={noseY - 1} rx={effNoseWidth + 1} ry={4}
              fill="rgb(196,88,68)" opacity={intensity * 1.15} />
            {/* Cheek apples — zygomatic flush on both sides */}
            <ellipse cx={cx - headWidth + 12} cy={eyeY + 13}
              rx={7.5} ry={5} fill="rgb(186,78,58)" opacity={intensity * 0.85}
              transform={`rotate(-12 ${cx - headWidth + 12} ${eyeY + 13})`} />
            <ellipse cx={cx + headWidth - 12} cy={eyeY + 13}
              rx={7.5} ry={5} fill="rgb(186,78,58)" opacity={intensity * 0.85}
              transform={`rotate(12 ${cx + headWidth - 12} ${eyeY + 13})`} />
            {/* Forehead cap — where a hat brim stops, the exposed strip catches sun too */}
            {ageIdx >= 2 && (
              <ellipse cx={cx} cy={eyeY - foreheadHeight * 0.35}
                rx={headWidth * 0.55} ry={5}
                fill="rgb(186,78,58)" opacity={intensity * 0.45} />
            )}
          </g>
        );
      })()}

      {/* Nose */}
      {renderNose(cx, eyeY, noseY, noseLength, effNoseWidth, noseBridge, noseTip, noseCurve, philtrumDepth, mouthY, config.hasBrokenNose, skin)}

      {/* Directional eye socket shadows — deeper on shadow side */}
      <ellipse cx={cx - eyeSpacing - lightSide * 1} cy={eyeY + 1}
        rx={eyeWidth * 0.55} ry={eyeHeight + 2}
        fill={`rgba(0,0,0,${lightSide < 0 ? 0.08 * lightIntensity : 0.03})`} />
      <ellipse cx={cx + eyeSpacing - lightSide * 1} cy={eyeY + 1}
        rx={eyeWidth * 0.55} ry={eyeHeight + 2}
        fill={`rgba(0,0,0,${lightSide > 0 ? 0.03 : 0.08 * lightIntensity})`} />

      {/* Eyes with proper eyelids — blink timing staggered by seed */}
      {(() => {
        const blinkDur = 3.5 + (Math.abs(config.seed) % 500) / 500 * 2.5; // 3.5–6s
        const blinkDel = (Math.abs(config.seed) % 1000) / 1000 * 3; // 0–3s offset
        // Only one brow (randomized by seed) gets the lift animation — looks more natural
        const liftLeftBrow = browLift && (config.seed & 2) === 0;
        const liftRightBrow = browLift && !liftLeftBrow;
        return (<>
          {renderEyeWithLid(cx - eyeSpacing, eyeY + eyeYOffsetL, eyeWidth, eyeHeight + eyeHeightOffsetL, eyeSlant, eyeLidWeight, epicanthicFold, eyeColor, skin, browInnerL + browDriftL, browOuterL + browDriftL, hairColor, config, underEyeBags, true, uid, gazeOffsetX, gazeOffsetY, eyeShape, blinkDur, blinkDel, gazeAnim, liftLeftBrow ? browAnim : '')}
          {renderEyeWithLid(cx + eyeSpacing, eyeY + eyeYOffsetR, eyeWidth, eyeHeight + eyeHeightOffsetR, -eyeSlant, eyeLidWeight, epicanthicFold, eyeColor, skin, browInnerR + browDriftR, browOuterR + browDriftR, hairColor, config, underEyeBags, false, uid, gazeOffsetX, gazeOffsetY, eyeShape, blinkDur, blinkDel, gazeAnim, liftRightBrow ? browAnim : '')}
        </>);
      })()}

      {/* Mouth */}
      {renderMouth(cx, mouthY, mouthWidth, effUpperLip, effLowerLip, mouthCurve, mouthAsym, skin, config.hasGoldTooth, config.seed, config.personality)}

      {/* Lower lip specular — wet highlight on the fullest part */}
      <ellipse cx={cx + lightSide * 2} cy={mouthY + effLowerLip * 0.35 + 1}
        rx={mouthWidth * 0.35} ry={effLowerLip * 0.2}
        fill="rgba(255,250,245,0.12)" opacity={lightIntensity} />

      {/* Chin highlight */}
      <ellipse cx={cx + lightSide * 3} cy={chinY - 4}
        rx={5} ry={3} fill="rgba(255,248,230,0.06)" opacity={lightIntensity} />

      {/* Chin cleft */}
      {chinCleft > 0 && (
        <ellipse cx={cx} cy={chinY - 2} rx={2} ry={chinCleft} fill="rgba(0,0,0,0.08)" />
      )}

      {/* Wrinkles */}
      {wrinkleAlpha > 0 && renderWrinkles(cx, eyeY, noseY, mouthY, eyeSpacing, effNoseWidth, headWidth, wrinkleAlpha)}

      {/* Facial hair */}
      {config.gender === 'Male' && renderFacialHair(config, rng, cx, mouthY, mouthWidth, chinY, jawWidth, headWidth, hairColor)}

      {/* Freckles / sun damage */}
      {config.hasFreckles && renderFreckles(rng, cx, eyeY, headWidth, noseY)}

      {/* Tattoo / cultural marking */}
      {config.hasTattoo && renderTattoo(config, rng, cx, eyeY, headWidth, mouthY, chinY)}

      {/* Facial mark (mole/birthmark) */}
      {config.hasFacialMark && renderFacialMark(config, cx, eyeY, headWidth, chinY)}

      {/* Scar */}
      {config.isScarred && !config.hasEyePatch && renderScar(config, rng, cx, eyeY, eyeSpacing)}

      {/* Eye patch (replaces one eye) */}
      {config.hasEyePatch && renderEyePatch(rng, cx, eyeY, eyeSpacing, headWidth)}

      {/* Earring */}
      {config.hasEarring && renderEarring(rng, cx, eyeY, headWidth)}

      {/* Health tint — subtle color wash over the face skin (fever red, scurvy yellow, etc.) */}
      {healthTint && (
        <g key="health-tint">
          <path d={headPath(cx, headTop, eyeY, chinY, headWidth, jawWidth, cheekWidth, foreheadHeight, jowlSag)}
            fill={healthTint.color} opacity={healthTint.opacity} style={{ mixBlendMode: 'multiply' }} />
          {healthTint.shineOpacity > 0 && (
            <>
              {/* Forehead sweat sheen for fever */}
              <ellipse cx={cx + lightSide * 4} cy={headTop + foreheadHeight + 4}
                rx={headWidth * 0.45} ry={4}
                fill="rgba(255,250,240,1)" opacity={healthTint.shineOpacity} />
              {/* A couple of sweat droplets */}
              <circle cx={cx - 12 + (config.seed % 10)} cy={eyeY - 10} r={0.9}
                fill="rgba(220,230,240,0.7)" />
              <circle cx={cx + 14 - ((config.seed + 3) % 8)} cy={eyeY - 6} r={0.7}
                fill="rgba(220,230,240,0.6)" />
            </>
          )}
        </g>
      )}

      {/* Front hair */}
      {renderFrontHair(config, rng, cx, headTop, headWidth, eyeY, foreheadHeight, hairColor)}

      {/* Headwear */}
      {renderHeadwear(config, rng, cx, headTop, headWidth, eyeY, foreheadHeight, hairColor)}

      {/* Neck kerchief (over clothing, under chin) */}
      {config.hasNeckKerchief && renderNeckKerchief(config, cx, chinY)}

      {/* Neck jewelry */}
      {config.hasNeckJewelry && renderNeckJewelry(config, rng, cx, chinY)}

      {/* Clay pipe (on top of everything) */}
      {config.hasPipe && renderPipe(rng, cx, mouthY)}

      </g>
      {/* /idle sway group */}

      {/* Quality border glow */}
      {config.quality === 'legendary' && showBg && (
        <rect width="200" height="250" fill="none" stroke="rgba(168,85,247,0.25)" strokeWidth="3" rx="2" />
      )}
      {config.quality === 'renowned' && showBg && (
        <rect width="200" height="250" fill="none" stroke="rgba(34,211,238,0.22)" strokeWidth="2.5" rx="2" />
      )}
      {config.quality === 'seasoned' && showBg && (
        <rect width="200" height="250" fill="none" stroke="rgba(52,211,153,0.2)" strokeWidth="2" rx="2" />
      )}
      {config.quality === 'disaster' && showBg && (
        <rect width="200" height="250" fill="none" stroke="rgba(185,28,28,0.25)" strokeWidth="2" rx="2" />
      )}
    </g>
  );
}

// ── Head shape ──────────────────────────────────────────

function headPath(
  cx: number, headTop: number, eyeY: number, chinY: number,
  hw: number, jw: number, cw: number, fh: number, jowl: number,
): string {
  const topY = headTop;
  return `M ${cx} ${topY}
    C ${cx + hw * 0.8} ${topY - fh * 0.3}, ${cx + hw + 4} ${topY + fh * 1.5}, ${cx + cw} ${eyeY - 5}
    C ${cx + cw + 1} ${eyeY + 20}, ${cx + jw + 6 + jowl} ${chinY - 20}, ${cx + jw + jowl * 0.5} ${chinY - 5}
    C ${cx + jw * 0.5} ${chinY + 4}, ${cx + 4} ${chinY + 6}, ${cx} ${chinY + 6}
    C ${cx - 4} ${chinY + 6}, ${cx - jw * 0.5} ${chinY + 4}, ${cx - jw - jowl * 0.5} ${chinY - 5}
    C ${cx - jw - 6 - jowl} ${chinY - 20}, ${cx - cw - 1} ${eyeY + 20}, ${cx - cw} ${eyeY - 5}
    C ${cx - hw - 4} ${topY + fh * 1.5}, ${cx - hw * 0.8} ${topY - fh * 0.3}, ${cx} ${topY} Z`;
}

// ── Ears ─────────────────────────────────────────────────

function renderEars(
  cx: number, earY: number, hw: number, earSize: number, skin: SkinPalette, uid: string,
): React.ReactNode {
  const earTop = earY - earSize * 0.4;
  const earBot = earY + earSize * 0.6;
  // Subsurface warmth — the outer cartilage glows with the blush tone because light passes through it.
  // Thin strokes along the outer rim, stronger near the top helix where the ear is thinnest.
  return (
    <g key="ears">
      {/* Left ear */}
      <path
        d={`M ${cx - hw} ${earTop} C ${cx - hw - 6} ${earTop + 2}, ${cx - hw - 7} ${earBot - 2}, ${cx - hw} ${earBot}
            C ${cx - hw - 2} ${earBot - earSize * 0.15}, ${cx - hw - 2} ${earTop + earSize * 0.15}, ${cx - hw} ${earTop} Z`}
        fill={`url(#skin-${uid})`}
      />
      {/* Translucent blush along the outer helix */}
      <path
        d={`M ${cx - hw - 1} ${earTop + 1} C ${cx - hw - 5.5} ${earTop + 3}, ${cx - hw - 6.5} ${earBot - 3}, ${cx - hw - 1} ${earBot - 1}`}
        stroke={skin.blush} strokeWidth="2.2" fill="none" opacity={0.35} strokeLinecap="round"
      />
      <path
        d={`M ${cx - hw - 1} ${earTop + 3} C ${cx - hw - 4} ${earTop + 5}, ${cx - hw - 4} ${earBot - 4}, ${cx - hw - 1} ${earBot - 3}`}
        stroke="rgba(0,0,0,0.12)" strokeWidth="0.8" fill="none"
      />
      {/* Right ear */}
      <path
        d={`M ${cx + hw} ${earTop} C ${cx + hw + 6} ${earTop + 2}, ${cx + hw + 7} ${earBot - 2}, ${cx + hw} ${earBot}
            C ${cx + hw + 2} ${earBot - earSize * 0.15}, ${cx + hw + 2} ${earTop + earSize * 0.15}, ${cx + hw} ${earTop} Z`}
        fill={`url(#skin-${uid})`}
      />
      <path
        d={`M ${cx + hw + 1} ${earTop + 1} C ${cx + hw + 5.5} ${earTop + 3}, ${cx + hw + 6.5} ${earBot - 3}, ${cx + hw + 1} ${earBot - 1}`}
        stroke={skin.blush} strokeWidth="2.2" fill="none" opacity={0.35} strokeLinecap="round"
      />
      <path
        d={`M ${cx + hw + 1} ${earTop + 3} C ${cx + hw + 4} ${earTop + 5}, ${cx + hw + 4} ${earBot - 4}, ${cx + hw + 1} ${earBot - 3}`}
        stroke="rgba(0,0,0,0.12)" strokeWidth="0.8" fill="none"
      />
    </g>
  );
}

// ── Nose ─────────────────────────────────────────────────

function renderNose(
  cx: number, eyeY: number, noseY: number, noseLength: number,
  nw: number, nb: number, tip: number, curve: number,
  philtrumDepth: number, mouthY: number, isBroken: boolean,
  skin: SkinPalette,
): React.ReactNode {
  // Broken nose: bridge kinks mid-way rather than shifting uniformly, the way
  // a poorly-set fracture actually heals. Direction is deterministic per portrait.
  const brkDir = isBroken ? ((Math.round(cx) + Math.round(eyeY)) % 2 === 0 ? 1 : -1) : 0;
  const brkKink = isBroken ? 3.2 : 0;            // lateral kink at the mid-bridge
  const brkBulge = isBroken ? 2.2 : 0;           // thickness of the healed callus
  const bridgeMidY = eyeY + noseLength * 0.38;
  return (
    <g key="nose">
      {/* Bridge shadow — left side curves through the kink */}
      <path
        d={`M ${cx - nb} ${eyeY + 4}
            Q ${cx - nb - curve + brkKink * brkDir} ${bridgeMidY}, ${cx - nw} ${noseY}
            C ${cx - nw * 0.5} ${noseY + tip + 5}, ${cx + nw * 0.5} ${noseY + tip + 5}, ${cx + nw} ${noseY}
            Q ${cx + nb + curve + brkKink * brkDir} ${bridgeMidY}, ${cx + nb} ${eyeY + 4} Z`}
        fill="rgba(0,0,0,0.07)"
      />
      {/* Broken nose callus — visible ridge on the kinked side */}
      {isBroken && (
        <>
          <ellipse cx={cx + brkKink * brkDir * 0.7} cy={bridgeMidY}
            rx={nb + brkBulge} ry={3.2} fill="rgba(0,0,0,0.09)" />
          <path d={`M ${cx + brkKink * brkDir * 0.4} ${eyeY + 6}
                    Q ${cx + brkKink * brkDir * 1.1} ${bridgeMidY - 1},
                      ${cx + brkKink * brkDir * 0.5} ${bridgeMidY + 4}`}
            stroke="rgba(0,0,0,0.14)" strokeWidth="0.9" fill="none" strokeLinecap="round" />
          {/* Subtle highlight on the opposite side — the valley of the kink */}
          <path d={`M ${cx - brkKink * brkDir * 0.3} ${eyeY + 8}
                    Q ${cx - brkKink * brkDir * 0.6} ${bridgeMidY},
                      ${cx - brkKink * brkDir * 0.2} ${bridgeMidY + 5}`}
            stroke={skin.light} strokeWidth="0.7" fill="none" opacity={0.35} />
        </>
      )}
      {/* Nose tip bulb */}
      <ellipse cx={cx} cy={noseY + tip * 0.4} rx={nw - 0.5} ry={3.5 + Math.abs(tip) * 0.3} fill="rgba(0,0,0,0.06)" />
      {/* Subsurface warmth at the nose tip — light passing through the thin cartilage */}
      <ellipse cx={cx} cy={noseY + tip * 0.3} rx={nw * 0.7} ry={2.2} fill={skin.blush} opacity={0.22} />
      {/* Nostrils */}
      <ellipse cx={cx - nw * 0.45} cy={noseY + 1.5} rx={2.5} ry={2} fill="rgba(0,0,0,0.18)" />
      <ellipse cx={cx + nw * 0.45} cy={noseY + 1.5} rx={2.5} ry={2} fill="rgba(0,0,0,0.18)" />
      {/* Nostril wings */}
      <path d={`M ${cx - nw + 1} ${noseY - 1} C ${cx - nw - 1} ${noseY + 1}, ${cx - nw} ${noseY + 3}, ${cx - nw + 2} ${noseY + 3}`}
        stroke="rgba(0,0,0,0.2)" strokeWidth="0.8" fill="none" />
      <path d={`M ${cx + nw - 1} ${noseY - 1} C ${cx + nw + 1} ${noseY + 1}, ${cx + nw} ${noseY + 3}, ${cx + nw - 2} ${noseY + 3}`}
        stroke="rgba(0,0,0,0.2)" strokeWidth="0.8" fill="none" />
      {/* Philtrum — groove between nose and upper lip */}
      <path
        d={`M ${cx - 1.5} ${noseY + tip + 3} L ${cx - 2} ${mouthY - 3} M ${cx + 1.5} ${noseY + tip + 3} L ${cx + 2} ${mouthY - 3}`}
        stroke="rgba(0,0,0,0.06)" strokeWidth={philtrumDepth} fill="none"
      />
    </g>
  );
}

// ── Eyes with shape variation ────────────────────────────

function renderEyeWithLid(
  ex: number, ey: number, ew: number, eh: number,
  slant: number, lidWeight: number, epicanthic: number,
  irisColor: string, skin: SkinPalette,
  browInner: number, browOuter: number,
  hairColor: string, config: PortraitConfig,
  underEyeBags: number,
  isLeft: boolean, uid: string,
  gazeX: number = 0, gazeY: number = 0,
  eyeShape: 'round' | 'almond' | 'droopy' | 'wide' | 'hooded' = 'almond',
  blinkDuration: number = 4, blinkDelay: number = 0,
  gazeAnimation: string = '', browAnimation: string = '',
): React.ReactNode {
  const hw = ew / 2;
  const dir = isLeft ? -1 : 1;
  const key = isLeft ? 'eyeL' : 'eyeR';

  const innerX = ex - hw * dir;
  const outerX = ex + hw * dir;

  // ── Shape-dependent parameters ──
  // topSpread: how far the bezier curves bow outward (higher = rounder top)
  // botSpread: same for bottom curve
  // botOpen: how far down the bottom of the eye extends (fraction of eh)
  // topPeak: where the highest point of the upper curve sits (0=inner, 1=outer)
  //          controls whether the arc peaks toward the nose or toward the temple
  let topSpread: number, botSpread: number, botOpen: number, topPeak: number, droopOuter: number;

  switch (eyeShape) {
    case 'round':
      topSpread = 0.45; botSpread = 0.45; botOpen = 0.6; topPeak = 0.5; droopOuter = 0;
      break;
    case 'almond':
      topSpread = 0.3; botSpread = 0.3; botOpen = 0.4; topPeak = 0.45; droopOuter = 0;
      break;
    case 'wide':
      topSpread = 0.35; botSpread = 0.3; botOpen = 0.45; topPeak = 0.55; droopOuter = 0;
      break;
    case 'hooded':
      topSpread = 0.3; botSpread = 0.3; botOpen = 0.4; topPeak = 0.4; droopOuter = 0;
      break;
    case 'droopy':
      topSpread = 0.3; botSpread = 0.35; botOpen = 0.45; topPeak = 0.35; droopOuter = 2;
      break;
  }

  // The visible eye opening — lid covers the top portion
  // effEh is the height of the actual visible opening (sclera)
  const effEh = eh * (1 - lidWeight * 0.5); // lid eats into the top

  // Upper curve control points — the peak shifts based on topPeak
  // Instead of always bowing up symmetrically, the peak can sit
  // toward the inner corner (topPeak<0.5) or outer corner (topPeak>0.5)
  const peakX = innerX + (outerX - innerX) * topPeak;
  const topY = ey - effEh;           // highest point of visible eye opening
  const topInnerY = ey - effEh * (1 - Math.abs(topPeak - 0.5) * 0.6) + slant * 0.3;
  const topOuterY = ey - effEh * (1 - Math.abs(topPeak - 0.5) * 0.6) - slant * 0.3 + droopOuter * 0.4;

  // Bottom of eye
  const botInnerY = ey + effEh * botOpen + slant * 0.1 - epicanthic * 0.2;
  const botOuterY = ey + effEh * botOpen - slant * 0.1 + droopOuter * 0.4;

  // Corner positions
  const innerCornerY = ey + epicanthic * 0.2;
  const outerCornerY = ey + droopOuter;

  // Socket shadow — subtle
  const socket = (
    <ellipse key={`${key}-sock`} cx={ex} cy={ey + 1} rx={hw + 2} ry={effEh + 2} fill="rgba(0,0,0,0.04)" />
  );

  // Sclera — the visible white of the eye
  // Upper curve peaks based on topPeak position, not always at center
  const cp1x = innerX + hw * topSpread * 2 * dir;  // first control point
  const cp2x = outerX - hw * topSpread * 2 * dir;  // second control point
  const scleraPath = `M ${innerX} ${innerCornerY}
    C ${cp1x} ${topInnerY - epicanthic * 0.15}, ${cp2x} ${topOuterY}, ${outerX} ${outerCornerY}
    C ${cp2x} ${botOuterY}, ${cp1x} ${botInnerY}, ${innerX} ${innerCornerY} Z`;

  const sclera = <path key={`${key}-scl`} d={scleraPath} fill="#eeeae2" />;

  // Iris — large and expressive, fills more of the eye opening
  const irisR = Math.min(effEh * 0.85, hw * 0.52);
  const pupilR = irisR * 0.38;
  const irisX = ex + gazeX;
  const irisY = ey + gazeY * 0.5 + droopOuter * 0.15;
  const iris = (
    <g key={`${key}-iris`} clipPath={`url(#${key}-clip-${uid})`}
      style={gazeAnimation ? {
        transformBox: 'fill-box' as any,
        transformOrigin: '50% 50%',
        animation: gazeAnimation,
      } : undefined}>
      {/* Iris outline for definition */}
      <circle cx={irisX} cy={irisY} r={irisR + 0.8} fill="#1a1a1a" opacity={0.18} />
      {/* Main iris */}
      <circle cx={irisX} cy={irisY} r={irisR} fill={irisColor} />
      {/* Inner iris ring for depth */}
      <circle cx={irisX} cy={irisY} r={irisR * 0.7} fill="none" stroke={irisColor} strokeWidth="0.8" opacity={0.4} />
      {/* Iris gradient — darker at edges */}
      <circle cx={irisX} cy={irisY} r={irisR} fill="none" stroke="rgba(0,0,0,0.15)" strokeWidth={irisR * 0.3} />
      {/* Pupil */}
      <circle cx={irisX} cy={irisY} r={pupilR} fill="#080808" />
      {/* Primary catchlight — large, warm-tinted */}
      <ellipse cx={irisX + irisR * 0.22} cy={irisY - irisR * 0.22} rx={irisR * 0.28} ry={irisR * 0.24} fill="rgba(255,252,240,0.9)" />
      {/* Secondary catchlight */}
      <circle cx={irisX - irisR * 0.18} cy={irisY + irisR * 0.2} r={irisR * 0.12} fill="rgba(255,255,255,0.5)" />
    </g>
  );

  // Clip path so iris doesn't overflow the sclera
  const irisClip = (
    <defs key={`${key}-clip-def-${uid}`}>
      <clipPath id={`${key}-clip-${uid}`}>
        <path d={scleraPath} />
      </clipPath>
    </defs>
  );

  // Blink lid — skin-colored overlay that briefly covers the eye
  const blinkLid = (
    <path
      key={`${key}-blink-lid`}
      d={scleraPath}
      fill={skin.mid}
      style={{
        transformBox: 'fill-box' as any,
        transformOrigin: '50% 0%',
        animation: `blink-${uid} ${blinkDuration}s ease-in-out ${blinkDelay}s infinite`,
      }}
    />
  );

  // Upper eyelid — skin-colored, sits above the visible opening
  // For hooded eyes, the lid is thick and opaque; for others it's subtler
  const lidOpacity = eyeShape === 'hooded' ? 0.85 : 0.65;
  // The lid covers from the top of the full eye socket down to the visible opening
  const fullTopY = ey - eh; // top of the full socket (before lid cuts in)
  const lidPath = `M ${innerX} ${innerCornerY}
    C ${cp1x} ${fullTopY - epicanthic * 0.15}, ${cp2x} ${fullTopY - slant * 0.3}, ${outerX} ${outerCornerY}
    C ${cp2x} ${topOuterY + 1}, ${cp1x} ${topInnerY + 1 - epicanthic * 0.1}, ${innerX} ${innerCornerY} Z`;

  const lid = (
    <path key={`${key}-lid`} d={lidPath} fill={skin.mid} opacity={lidOpacity} />
  );

  // Eyelid crease — above the lid
  const creaseY = fullTopY - 2;
  const creasePath = `M ${innerX + dir * 2} ${creaseY + slant * 0.2 - epicanthic * 0.1}
    C ${cp1x} ${creaseY - 1}, ${cp2x} ${creaseY - slant * 0.2 + droopOuter * 0.2}, ${outerX - dir * 1} ${outerCornerY - 1.5}`;
  const crease = eyeShape !== 'hooded' ? (
    <path key={`${key}-crease`} d={creasePath}
      stroke="rgba(0,0,0,0.12)" strokeWidth="0.7" fill="none" />
  ) : null;

  // For hooded eyes, a heavier fold line closer to the lash line
  const hoodFold = eyeShape === 'hooded' ? (
    <path key={`${key}-hood`}
      d={`M ${innerX + dir * 1} ${innerCornerY - 0.5}
          C ${cp1x} ${topInnerY - 0.5}, ${cp2x} ${topOuterY - 0.5 + droopOuter * 0.2}, ${outerX - dir * 1} ${outerCornerY - 0.5}`}
      stroke="rgba(0,0,0,0.18)" strokeWidth="0.9" fill="none" />
  ) : null;

  // Lower lid line
  const lowerLid = (
    <path key={`${key}-lower`}
      d={`M ${innerX + dir * 1} ${innerCornerY + 0.3}
          C ${cp1x} ${botInnerY + 0.5}, ${cp2x} ${botOuterY + 0.5}, ${outerX - dir * 1} ${outerCornerY + 0.5}`}
      stroke="rgba(0,0,0,0.10)" strokeWidth="0.5" fill="none"
    />
  );

  // Lash line — follows the visible upper lid edge
  const lashLine = (
    <path key={`${key}-lash`}
      d={`M ${innerX} ${innerCornerY}
          C ${cp1x} ${topInnerY}, ${cp2x} ${topOuterY + droopOuter * 0.2}, ${outerX} ${outerCornerY}`}
      stroke="rgba(0,0,0,0.4)" strokeWidth={config.gender === 'Female' ? 1.2 : 0.7} fill="none"
    />
  );

  // Epicanthic fold
  const fold = epicanthic > 0.5 ? (
    <path key={`${key}-fold`}
      d={`M ${innerX - dir * 1} ${ey} C ${innerX + dir * 2} ${ey - epicanthic - 0.5}, ${innerX + dir * 5} ${ey - epicanthic}, ${innerX + dir * 7} ${ey - epicanthic * 0.4}`}
      stroke="rgba(0,0,0,0.12)" strokeWidth="0.8" fill="none" />
  ) : null;

  // Under-eye bags / dark circles
  const bags = underEyeBags > 0 ? (
    <path key={`${key}-bags`}
      d={`M ${innerX + dir * 3} ${ey + effEh * botOpen}
          C ${ex - dir * 2} ${ey + effEh * botOpen + 2.5}, ${ex + dir * 2} ${ey + effEh * botOpen + 2.5}, ${outerX - dir * 3} ${ey + effEh * botOpen}`}
      stroke="rgba(0,0,0,0.18)" strokeWidth="0.6" fill="none" opacity={underEyeBags / 0.08 * 0.3}
    />
  ) : null;

  // Eyebrow
  const browThick = config.gender === 'Male' ? 2.5 : 1.6;
  const browInnerX = ex - hw * 0.9 * dir;
  const browOuterX = ex + hw * 1.15 * dir;
  const browBaseY = fullTopY - 4;
  const brow = (
    <path key={`${key}-brow`}
      d={`M ${browInnerX} ${browBaseY + browInner}
          Q ${ex} ${browBaseY + Math.min(browInner, browOuter) - 3}, ${browOuterX} ${browBaseY + browOuter + droopOuter * 0.3}`}
      style={browAnimation ? {
        transformBox: 'fill-box' as any,
        transformOrigin: '50% 100%',
        animation: browAnimation,
      } : undefined}
      stroke={hairColor} strokeWidth={browThick} fill="none" strokeLinecap="round"
    />
  );

  return <g key={key}>{irisClip}{socket}{sclera}{iris}{blinkLid}{lid}{crease}{hoodFold}{lashLine}{lowerLid}{fold}{bags}{brow}</g>;
}

// ── Mouth ────────────────────────────────────────────────

function renderMouth(
  cx: number, my: number, hw: number,
  upperLip: number, lowerLip: number,
  curve: number, asym: number, skin: SkinPalette,
  hasGoldTooth: boolean = false, seed: number = 0,
  personality: Personality = 'Neutral',
): React.ReactNode {
  const leftY = my + curve - asym;
  const rightY = my + curve + asym;
  const lipColor = skin.blush;

  // Lip shape varies with thickness — thin lips have flatter, tighter curves
  const fullRatio = Math.min(upperLip / 3.5, 1);  // 0 = very thin, 1 = full
  const bowDepth = 0.5 + fullRatio * 1.5;          // cupid's bow prominence
  const cornerTuck = 1 + fullRatio * 0.8;          // how much corners tuck in

  // Teeth visibility — only truly elated grins. Threshold set high enough that
  // a merely Friendly personality at neutral morale doesn't trigger; it takes
  // Friendly + morale ≥ 85, or morale ≥ 95 on an already-smiley base.
  const rageTeeth = personality === 'Rage';
  const showTeeth = curve <= -4 || rageTeeth;
  const openH = showTeeth ? Math.min(2.8, (-curve - 2) * 0.5) : 0;
  const teethHw = hw * 0.72;

  return (
    <g key="mouth">
      {/* Upper lip — cupid's bow depth scales with fullness */}
      <path
        d={`M ${cx - hw} ${leftY}
            C ${cx - hw * 0.4} ${my - upperLip - bowDepth * 0.3}, ${cx - 2} ${my - upperLip - bowDepth}, ${cx} ${my - upperLip * 0.6}
            C ${cx + 2} ${my - upperLip - bowDepth}, ${cx + hw * 0.4} ${my - upperLip - bowDepth * 0.3}, ${cx + hw} ${rightY}
            C ${cx + hw * 0.3} ${my + cornerTuck}, ${cx - hw * 0.3} ${my + cornerTuck}, ${cx - hw} ${leftY} Z`}
        fill={lipColor} opacity={0.7}
      />
      {/* Lower lip */}
      <path
        d={`M ${cx - hw} ${leftY}
            C ${cx - hw * 0.35} ${my + lowerLip + curve * 0.3}, ${cx + hw * 0.35} ${my + lowerLip + curve * 0.3}, ${cx + hw} ${rightY}
            C ${cx + hw * 0.3} ${my + cornerTuck}, ${cx - hw * 0.3} ${my + cornerTuck}, ${cx - hw} ${leftY} Z`}
        fill={lipColor} opacity={0.6}
      />
      {/* Lower lip highlight */}
      <ellipse cx={cx} cy={my + lowerLip * 0.4 + 1} rx={hw * 0.5} ry={lowerLip * 0.3}
        fill="rgba(255,255,255,0.1)" />
      {/* Lip line — thicker for readability */}
      <path
        d={`M ${cx - hw} ${leftY} C ${cx - hw * 0.3} ${my + 1}, ${cx + hw * 0.3} ${my + 1}, ${cx + hw} ${rightY}`}
        stroke="rgba(0,0,0,0.5)" strokeWidth="1.2" fill="none"
      />
      {/* Lower lip shadow */}
      <path
        d={`M ${cx - hw + 3} ${my + lowerLip + curve * 0.3 + 1}
            C ${cx - hw * 0.2} ${my + lowerLip + curve * 0.3 + 2.5}, ${cx + hw * 0.2} ${my + lowerLip + curve * 0.3 + 2.5}, ${cx + hw - 3} ${my + lowerLip + curve * 0.3 + 1}`}
        stroke="rgba(0,0,0,0.14)" strokeWidth="0.8" fill="none"
      />
      {/* Teeth — only for genuinely broad smiles. Teeth follow the smile arc:
          outer teeth sit higher and are shorter/fainter (following the lifted corners),
          inner teeth sit lower and are full-height, matching the dip in the lip line. */}
      {showTeeth && (() => {
        if (rageTeeth) {
          const clenchedH = 5.2;
          const clenchedW = hw * 1.12;
          const topY = my - 2.2;
          const toothCount = 6;
          const toothW = (clenchedW * 2) / toothCount;
          return (
            <g key="rage-teeth">
              <path
                d={`M ${cx - clenchedW - 1} ${topY + 0.5}
                    C ${cx - clenchedW * 0.45} ${topY - 2.2}, ${cx + clenchedW * 0.45} ${topY - 2.2}, ${cx + clenchedW + 1} ${topY + 0.5}
                    L ${cx + clenchedW - 1} ${topY + clenchedH}
                    C ${cx + clenchedW * 0.4} ${topY + clenchedH + 1.5}, ${cx - clenchedW * 0.4} ${topY + clenchedH + 1.5}, ${cx - clenchedW + 1} ${topY + clenchedH}
                    Z`}
                fill="#180909"
                opacity={0.94}
              />
              <rect
                x={cx - clenchedW * 0.86}
                y={topY + 0.9}
                width={clenchedW * 1.72}
                height={clenchedH * 0.72}
                rx={1.1}
                fill="#e8ddc2"
                stroke="rgba(0,0,0,0.28)"
                strokeWidth={0.45}
              />
              <path
                d={`M ${cx - clenchedW * 0.82} ${topY + clenchedH * 0.48}
                    L ${cx + clenchedW * 0.82} ${topY + clenchedH * 0.48}`}
                stroke="rgba(70,35,24,0.34)"
                strokeWidth={0.55}
              />
              {Array.from({ length: toothCount - 1 }).map((_, i) => {
                const x = cx - clenchedW * 0.86 + toothW * (i + 1);
                return (
                  <path
                    key={`rage-tooth-${i}`}
                    d={`M ${x} ${topY + 1.2} L ${x + (i % 2 === 0 ? 0.4 : -0.3)} ${topY + clenchedH * 0.72}`}
                    stroke="rgba(70,35,24,0.24)"
                    strokeWidth={0.45}
                  />
                );
              })}
              <path
                d={`M ${cx - clenchedW} ${topY + 0.5}
                    C ${cx - clenchedW * 0.35} ${topY - 2.8}, ${cx + clenchedW * 0.35} ${topY - 2.8}, ${cx + clenchedW} ${topY + 0.5}`}
                stroke="rgba(0,0,0,0.55)"
                strokeWidth={1.2}
                fill="none"
                strokeLinecap="round"
              />
              <path
                d={`M ${cx - clenchedW * 0.92} ${topY + clenchedH}
                    C ${cx - clenchedW * 0.35} ${topY + clenchedH + 2.2}, ${cx + clenchedW * 0.35} ${topY + clenchedH + 2.2}, ${cx + clenchedW * 0.92} ${topY + clenchedH}`}
                stroke="rgba(0,0,0,0.45)"
                strokeWidth={1.1}
                fill="none"
                strokeLinecap="round"
              />
            </g>
          );
        }
        const toothCount = 5;
        const strideX = (teethHw * 2) / toothCount;
        const toothW = strideX * 0.78;
        // Where the lips sit at corners vs. center. The smile curve dips at the center
        // (lip line control point at my + 1) and rises at the corners (leftY/rightY).
        const cornerY = (leftY + rightY) / 2;
        const centerY = my + 0.5;
        // Gold tooth in an off-center position (index 1 or 3), seeded so it's stable.
        const goldIdx = hasGoldTooth ? (Math.abs(seed) % 2 === 0 ? 1 : 3) : -1;
        // Build a smooth arc path for the dark oral cavity: mirrors the smile shape.
        const cavityTop = `M ${cx - teethHw} ${cornerY - 0.4}
            Q ${cx} ${centerY - openH * 0.5}, ${cx + teethHw} ${cornerY - 0.4}`;
        const cavityBot = `Q ${cx} ${centerY + openH * 0.55}, ${cx - teethHw} ${cornerY - 0.4} Z`;
        return (
          <g key="teeth">
            {/* Dark oral cavity — arc-shaped, matches the smile */}
            <path d={`${cavityTop} ${cavityBot}`} fill="#1a0c0a" opacity={0.88} />
            {/* Teeth row — each tooth placed on the arc, shorter at edges */}
            {Array.from({ length: toothCount }).map((_, i) => {
              // t ∈ [-1, +1] — normalized horizontal position
              const t = (i - (toothCount - 1) / 2) / ((toothCount - 1) / 2);
              const tx = cx + t * teethHw * 0.92;
              // Arc: corner-high at t=±1, center-low at t=0. Quadratic blend.
              const baseY = cornerY + (centerY - cornerY) * (1 - t * t);
              // Outer teeth are shorter (less gap showing at corners)
              const heightScale = 0.4 + 0.6 * (1 - t * t);
              const toothH = openH * heightScale * 0.85;
              const isGold = i === goldIdx;
              return (
                <rect key={`tooth-${i}`}
                  x={tx - toothW / 2}
                  y={baseY - toothH * 0.55}
                  width={toothW}
                  height={toothH}
                  rx={0.6}
                  fill={isGold ? '#d4a020' : '#ede3c6'}
                  stroke={isGold ? '#a07818' : 'rgba(0,0,0,0.18)'}
                  strokeWidth={isGold ? 0.4 : 0.25}
                  opacity={isGold ? 1 : 0.5 + 0.5 * (1 - t * t)}
                />
              );
            })}
            {/* Upper-lip cast shadow along the smile arc — sells the teeth receding under the lip */}
            <path d={`M ${cx - teethHw} ${cornerY - 0.3}
                Q ${cx} ${centerY - openH * 0.2}, ${cx + teethHw} ${cornerY - 0.3}`}
              stroke="rgba(0,0,0,0.4)" strokeWidth={openH * 0.35} fill="none" strokeLinecap="round" />
          </g>
        );
      })()}
    </g>
  );
}

// ── Wrinkles ─────────────────────────────────────────────

function renderWrinkles(
  cx: number, eyeY: number, noseY: number, mouthY: number,
  eyeSpacing: number, noseWidth: number, headWidth: number, alpha: number,
): React.ReactNode {
  // Deeper ages reveal additional lines; alpha drives both opacity and line count.
  const deep = alpha > 0.4;                       // 50s+ gets additional crow's feet / fold branches
  const deeper = alpha > 0.6;                     // 60s gets the glabellar "11" lines and jowl creases
  return (
    <g key="wrinkles" stroke="rgba(0,0,0,0.22)" strokeWidth="0.7" fill="none" opacity={alpha}>
      {/* Nasolabial folds — the main aging tell */}
      <path d={`M ${cx - noseWidth - 3} ${noseY + 2} Q ${cx - 20} ${mouthY}, ${cx - 22} ${mouthY + 8}`} />
      <path d={`M ${cx + noseWidth + 3} ${noseY + 2} Q ${cx + 20} ${mouthY}, ${cx + 22} ${mouthY + 8}`} />
      {deep && (
        <>
          {/* Secondary parallel fold — a double crease at the cheek */}
          <path d={`M ${cx - noseWidth - 1} ${noseY + 5} Q ${cx - 17} ${mouthY + 1}, ${cx - 18} ${mouthY + 7}`}
            strokeWidth="0.5" opacity={0.75} />
          <path d={`M ${cx + noseWidth + 1} ${noseY + 5} Q ${cx + 17} ${mouthY + 1}, ${cx + 18} ${mouthY + 7}`}
            strokeWidth="0.5" opacity={0.75} />
        </>
      )}
      {/* Forehead creases */}
      <path d={`M ${cx - headWidth + 10} ${eyeY - 30} Q ${cx} ${eyeY - 32} ${cx + headWidth - 10} ${eyeY - 30}`} />
      <path d={`M ${cx - headWidth + 14} ${eyeY - 24} Q ${cx} ${eyeY - 26} ${cx + headWidth - 14} ${eyeY - 24}`} />
      {deep && (
        <path d={`M ${cx - headWidth + 12} ${eyeY - 18} Q ${cx} ${eyeY - 20} ${cx + headWidth - 12} ${eyeY - 18}`}
          strokeWidth="0.55" />
      )}
      {/* Glabellar "11" lines between the brows — only for older faces */}
      {deeper && (
        <>
          <path d={`M ${cx - 2.5} ${eyeY - 12} l 0 7`} strokeWidth="0.65" />
          <path d={`M ${cx + 2.5} ${eyeY - 12} l 0 7`} strokeWidth="0.65" />
        </>
      )}
      {/* Crow's feet — simple at 30s/40s, fanning out at 50s+ */}
      <path d={`M ${cx - eyeSpacing - 9} ${eyeY - 1} l -4 -2 M ${cx - eyeSpacing - 9} ${eyeY + 2} l -4 2`} />
      <path d={`M ${cx + eyeSpacing + 9} ${eyeY - 1} l 4 -2 M ${cx + eyeSpacing + 9} ${eyeY + 2} l 4 2`} />
      {deep && (
        <>
          <path d={`M ${cx - eyeSpacing - 10} ${eyeY} l -5 0`} strokeWidth="0.55" />
          <path d={`M ${cx + eyeSpacing + 10} ${eyeY} l 5 0`} strokeWidth="0.55" />
          <path d={`M ${cx - eyeSpacing - 9} ${eyeY + 5} l -4 3`} strokeWidth="0.55" />
          <path d={`M ${cx + eyeSpacing + 9} ${eyeY + 5} l 4 3`} strokeWidth="0.55" />
        </>
      )}
      {/* Jowl / marionette creases — pulled-down lines below the mouth corners */}
      {deeper && (
        <>
          <path d={`M ${cx - 11} ${mouthY + 5} q -1 5 -2 10`} strokeWidth="0.6" />
          <path d={`M ${cx + 11} ${mouthY + 5} q 1 5 2 10`} strokeWidth="0.6" />
        </>
      )}
    </g>
  );
}

// ── Facial hair ──────────────────────────────────────────

// Adjust a hex color's lightness by a delta (-1..1). Used to derive shadow + highlight tones from base hair color.
function shiftHex(hex: string, delta: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const f = (c: number) => {
    const v = delta >= 0 ? c + (255 - c) * delta : c * (1 + delta);
    return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  };
  return `#${f(r)}${f(g)}${f(b)}`;
}

type BeardStyle = 'vandyke' | 'spade' | 'pointed' | 'fullBushy' | 'square' | 'patriarch' | 'goatee' | 'chinStrap' | 'stubble' | 'mustacheOnly';

function renderFacialHair(
  config: PortraitConfig, rng: () => number,
  cx: number, mouthY: number, _mouthW: number,
  chinY: number, jawW: number, headWidth: number, hairColor: string,
): React.ReactNode {
  const age = ['20s', '30s', '40s', '50s', '60s'].indexOf(config.age);
  // Young men: usually clean-shaven or stubble
  if (age === 0 && rng() > 0.35) return null;

  const grow = rng();
  const cg = config.culturalGroup;

  const beardLikelihood =
    cg === 'ArabPersian' ? 0.88 :
    cg === 'Indian' ? 0.78 :
    cg === 'NorthEuropean' ? 0.55 :
    cg === 'SouthEuropean' ? 0.62 :
    cg === 'EastAsian' ? 0.18 :
    cg === 'SoutheastAsian' ? 0.22 :
    cg === 'Swahili' ? 0.6 : 0.45;

  if (grow > beardLikelihood + 0.12) return null;

  // ── Pick a culturally-weighted style ──
  const styleRoll = rng();
  let style: BeardStyle;
  if (cg === 'ArabPersian' || cg === 'Indian') {
    // Trimmed full or patriarchal flowing styles dominate
    style = age >= 3 && styleRoll > 0.55 ? 'patriarch' :
            styleRoll > 0.35 ? 'fullBushy' :
            styleRoll > 0.15 ? 'square' : 'pointed';
  } else if (cg === 'NorthEuropean' || cg === 'SouthEuropean') {
    // Van Dyke and spade beards were the height of fashion c.1610s
    style = styleRoll > 0.7 ? 'vandyke' :
            styleRoll > 0.5 ? 'spade' :
            styleRoll > 0.35 ? 'pointed' :
            styleRoll > 0.22 ? 'fullBushy' :
            styleRoll > 0.12 ? 'mustacheOnly' :
            styleRoll > 0.06 ? 'goatee' : 'stubble';
  } else if (cg === 'EastAsian') {
    style = styleRoll > 0.6 ? 'patriarch' :
            styleRoll > 0.3 ? 'pointed' : 'mustacheOnly';
  } else if (cg === 'SoutheastAsian') {
    style = styleRoll > 0.5 ? 'goatee' : styleRoll > 0.25 ? 'mustacheOnly' : 'stubble';
  } else if (cg === 'Swahili') {
    style = styleRoll > 0.55 ? 'fullBushy' :
            styleRoll > 0.3 ? 'chinStrap' :
            styleRoll > 0.15 ? 'stubble' : 'goatee';
  } else {
    style = styleRoll > 0.5 ? 'fullBushy' : styleRoll > 0.25 ? 'goatee' : 'stubble';
  }

  // Outdoor working sailors more often have unkempt full or stubble
  if (config.isSailor && rng() > 0.6 && (cg === 'NorthEuropean' || cg === 'SouthEuropean')) {
    style = rng() > 0.5 ? 'fullBushy' : 'stubble';
  }

  // ── Tonal palette derived from hair color ──
  const shadow = shiftHex(hairColor, -0.35);
  const highlight = shiftHex(hairColor, 0.25);
  const isLight = hairColor === '#888888' || hairColor === '#b0b0b0' ||
    hairColor === '#d4a860' || hairColor === '#e0c880';
  const strandColor = isLight ? shiftHex(hairColor, -0.2) : shiftHex(hairColor, 0.15);
  const greying = age >= 4 && rng() > 0.4;

  return (
    <g key="facial-hair">
      {renderBeardStyle(style, cx, mouthY, chinY, jawW, headWidth, rng, hairColor, shadow, highlight, strandColor, greying, age)}
    </g>
  );
}

function renderBeardStyle(
  style: BeardStyle,
  cx: number, mouthY: number, chinY: number, jawW: number, headWidth: number,
  rng: () => number,
  base: string, shadow: string, highlight: string, strand: string,
  greying: boolean, age: number,
): React.ReactNode {
  const greyOverlay = greying ? '#c8c0b8' : null;
  // Most styles include a mustache; we render that here separately and compose.
  const mustacheStyle: 'walrus' | 'handlebar' | 'imperial' | 'trimmed' | 'thin' | 'none' =
    style === 'goatee' || style === 'chinStrap' || style === 'stubble' ? 'none' :
    style === 'patriarch' ? (rng() > 0.4 ? 'walrus' : 'trimmed') :
    style === 'vandyke' ? (rng() > 0.5 ? 'imperial' : 'handlebar') :
    style === 'spade' ? (rng() > 0.6 ? 'handlebar' : 'walrus') :
    style === 'pointed' ? (rng() > 0.5 ? 'handlebar' : 'trimmed') :
    style === 'mustacheOnly' ? (rng() > 0.5 ? 'walrus' : rng() > 0.5 ? 'handlebar' : 'trimmed') :
    'trimmed';

  const beardEl = renderBeardShape(style, cx, mouthY, chinY, jawW, headWidth, rng, base, shadow, highlight, strand);
  const mustEl = mustacheStyle !== 'none'
    ? renderMustacheShape(mustacheStyle, cx, mouthY, rng, base, shadow, highlight)
    : null;

  return (
    <g>
      {beardEl}
      {mustEl}
      {greyOverlay && (
        // Grey-streak overlay — applied softly across the whole beard area
        <ellipse cx={cx} cy={chinY - 2} rx={jawW + 2} ry={(chinY - mouthY) + 8}
          fill={greyOverlay} opacity={0.18} />
      )}
    </g>
  );
}

function renderBeardShape(
  style: BeardStyle, cx: number, mouthY: number, chinY: number,
  jawW: number, headWidth: number, rng: () => number,
  base: string, shadow: string, highlight: string, strand: string,
): React.ReactNode {
  switch (style) {
    case 'fullBushy': {
      // Wraps the entire jaw, fairly long
      const bLen = 12 + rng() * 14;
      const fullness = 1 + rng() * 0.3;
      const path = `M ${cx - headWidth + 2} ${mouthY - 6}
        C ${cx - headWidth - 2} ${chinY - 4}, ${cx - jawW - 2} ${chinY + bLen - 4}, ${cx} ${chinY + bLen + 2}
        C ${cx + jawW + 2} ${chinY + bLen - 4}, ${cx + headWidth + 2} ${chinY - 4}, ${cx + headWidth - 2} ${mouthY - 6}
        C ${cx + 16 * fullness} ${mouthY + 4}, ${cx - 16 * fullness} ${mouthY + 4}, ${cx - headWidth + 2} ${mouthY - 6} Z`;
      return (
        <g>
          <path d={path} fill={shadow} transform={`translate(0, 1)`} opacity={0.85} />
          <path d={path} fill={base} />
          {/* Highlight streak down the center */}
          <path d={`M ${cx - jawW * 0.4} ${mouthY + 4} Q ${cx} ${chinY + bLen * 0.4} ${cx + jawW * 0.4} ${mouthY + 4}`}
            stroke={highlight} strokeWidth="1.5" fill="none" opacity={0.4} />
          {strandsAlongCurve(cx - headWidth + 2, mouthY - 6, cx + headWidth - 2, mouthY - 6, cx, chinY + bLen + 2, 14, rng, strand, base, 4)}
        </g>
      );
    }
    case 'spade': {
      // Wide squared-off bottom — the classic Spanish/Habsburg court beard
      const bLen = 14 + rng() * 6;
      const flare = jawW - 4;
      const path = `M ${cx - flare} ${mouthY - 4}
        C ${cx - flare - 2} ${chinY - 2}, ${cx - flare - 6} ${chinY + bLen - 4}, ${cx - flare + 2} ${chinY + bLen}
        L ${cx + flare - 2} ${chinY + bLen}
        C ${cx + flare + 6} ${chinY + bLen - 4}, ${cx + flare + 2} ${chinY - 2}, ${cx + flare} ${mouthY - 4}
        C ${cx + 12} ${mouthY + 4}, ${cx - 12} ${mouthY + 4}, ${cx - flare} ${mouthY - 4} Z`;
      return (
        <g>
          <path d={path} fill={shadow} transform={`translate(0,1)`} opacity={0.9} />
          <path d={path} fill={base} />
          {/* Center mid-line groove (combed beard) */}
          <path d={`M ${cx} ${mouthY + 5} L ${cx} ${chinY + bLen - 2}`}
            stroke={shadow} strokeWidth="0.6" opacity={0.5} />
          {/* Highlight on lit side */}
          <path d={`M ${cx + 4} ${mouthY + 6} Q ${cx + flare * 0.7} ${chinY + bLen * 0.4} ${cx + flare * 0.4} ${chinY + bLen - 2}`}
            stroke={highlight} strokeWidth="1.2" fill="none" opacity={0.4} />
          {strandsAlongCurve(cx - flare, chinY + bLen - 2, cx + flare, chinY + bLen - 2, cx, chinY + bLen + 4, 10, rng, strand, base, 2.5)}
        </g>
      );
    }
    case 'vandyke': {
      // Pointed chin tuft + linked mustache (handled separately) — the gentleman's mark
      const tipLen = 12 + rng() * 8;
      const cw = 6 + rng() * 3;
      const path = `M ${cx - cw} ${mouthY + 3}
        C ${cx - cw - 2} ${chinY - 2}, ${cx - 2} ${chinY + tipLen}, ${cx} ${chinY + tipLen + 2}
        C ${cx + 2} ${chinY + tipLen}, ${cx + cw + 2} ${chinY - 2}, ${cx + cw} ${mouthY + 3}
        C ${cx + cw * 0.4} ${mouthY + 5}, ${cx - cw * 0.4} ${mouthY + 5}, ${cx - cw} ${mouthY + 3} Z`;
      return (
        <g>
          <path d={path} fill={shadow} transform="translate(0,1)" opacity={0.85} />
          <path d={path} fill={base} />
          {/* Center groove */}
          <path d={`M ${cx} ${mouthY + 5} L ${cx} ${chinY + tipLen}`}
            stroke={shadow} strokeWidth="0.5" opacity={0.6} />
          {/* Tip strand */}
          <path d={`M ${cx} ${chinY + tipLen + 2} l 0 3`} stroke={base} strokeWidth="1" strokeLinecap="round" />
        </g>
      );
    }
    case 'pointed': {
      // Narrow stiletto-pointed beard
      const tipLen = 10 + rng() * 12;
      const w = 7 + rng() * 4;
      const path = `M ${cx - w} ${mouthY - 2}
        C ${cx - w - 1} ${chinY - 2}, ${cx - 1} ${chinY + tipLen}, ${cx} ${chinY + tipLen + 3}
        C ${cx + 1} ${chinY + tipLen}, ${cx + w + 1} ${chinY - 2}, ${cx + w} ${mouthY - 2}
        C ${cx + w * 0.3} ${mouthY + 3}, ${cx - w * 0.3} ${mouthY + 3}, ${cx - w} ${mouthY - 2} Z`;
      return (
        <g>
          <path d={path} fill={shadow} transform="translate(0,1)" opacity={0.85} />
          <path d={path} fill={base} />
          <path d={`M ${cx} ${mouthY + 2} L ${cx + 0.5} ${chinY + tipLen + 1}`}
            stroke={highlight} strokeWidth="0.5" opacity={0.5} />
        </g>
      );
    }
    case 'square': {
      // Cropped square beard hugging the jaw
      const bLen = 4 + rng() * 6;
      const path = `M ${cx - jawW - 1} ${mouthY - 3}
        C ${cx - jawW - 3} ${chinY - 2}, ${cx - jawW + 2} ${chinY + bLen}, ${cx} ${chinY + bLen + 1}
        C ${cx + jawW - 2} ${chinY + bLen}, ${cx + jawW + 3} ${chinY - 2}, ${cx + jawW + 1} ${mouthY - 3}
        C ${cx + 14} ${mouthY + 3}, ${cx - 14} ${mouthY + 3}, ${cx - jawW - 1} ${mouthY - 3} Z`;
      return (
        <g>
          <path d={path} fill={shadow} opacity={0.85} transform="translate(0,1)" />
          <path d={path} fill={base} />
          {strandsAlongCurve(cx - jawW, chinY + bLen, cx + jawW, chinY + bLen, cx, chinY + bLen + 3, 8, rng, strand, base, 2)}
        </g>
      );
    }
    case 'patriarch': {
      // Long flowing beard — old wise men, scholars, imams
      const bLen = 26 + rng() * 18;
      const wave1 = (rng() - 0.5) * 4;
      const wave2 = (rng() - 0.5) * 4;
      const path = `M ${cx - jawW - 2} ${mouthY - 4}
        C ${cx - jawW - 8} ${chinY - 2}, ${cx - jawW - 6 + wave1} ${chinY + bLen * 0.5}, ${cx - jawW * 0.4} ${chinY + bLen}
        C ${cx - 4} ${chinY + bLen + 4}, ${cx + 4} ${chinY + bLen + 4}, ${cx + jawW * 0.4} ${chinY + bLen}
        C ${cx + jawW + 6 + wave2} ${chinY + bLen * 0.5}, ${cx + jawW + 8} ${chinY - 2}, ${cx + jawW + 2} ${mouthY - 4}
        C ${cx + 14} ${mouthY + 4}, ${cx - 14} ${mouthY + 4}, ${cx - jawW - 2} ${mouthY - 4} Z`;
      return (
        <g>
          <path d={path} fill={shadow} transform="translate(0,1.5)" opacity={0.9} />
          <path d={path} fill={base} />
          {/* Wavy strands flowing down the length */}
          {[0.3, 0.5, 0.7].map((t, i) => (
            <path key={`wv${i}`}
              d={`M ${cx - jawW * 0.4 + (i - 1) * 4} ${mouthY + 4 + t * (chinY + bLen - mouthY - 4)} q 2 4 0 8`}
              stroke={shadow} strokeWidth="0.5" fill="none" opacity={0.6} />
          ))}
          {/* Highlight along center */}
          <path d={`M ${cx} ${mouthY + 6} Q ${cx + 1} ${chinY + bLen * 0.5} ${cx} ${chinY + bLen}`}
            stroke={highlight} strokeWidth="1" fill="none" opacity={0.35} />
          {/* Strand wisps at the bottom tip */}
          {[-3, -1, 1, 3].map(dx => (
            <path key={`tip${dx}`}
              d={`M ${cx + dx} ${chinY + bLen + 2} l ${dx * 0.3} ${4 + rng() * 2}`}
              stroke={strand} strokeWidth="0.6" strokeLinecap="round" opacity={0.7} />
          ))}
        </g>
      );
    }
    case 'goatee': {
      // Small chin tuft, no mustache
      const w = 6 + rng() * 3;
      const len = 5 + rng() * 6;
      const path = `M ${cx - w} ${mouthY + 5}
        C ${cx - w - 1} ${chinY + len - 2}, ${cx - 2} ${chinY + len}, ${cx} ${chinY + len + 1}
        C ${cx + 2} ${chinY + len}, ${cx + w + 1} ${chinY + len - 2}, ${cx + w} ${mouthY + 5}
        C ${cx + w * 0.3} ${mouthY + 7}, ${cx - w * 0.3} ${mouthY + 7}, ${cx - w} ${mouthY + 5} Z`;
      return (
        <g>
          <path d={path} fill={shadow} transform="translate(0,1)" opacity={0.85} />
          <path d={path} fill={base} />
        </g>
      );
    }
    case 'chinStrap': {
      // Narrow band of hair following the jawline only — common in some African styles
      const r = rng;
      const sw = 1.6;
      return (
        <g>
          <path
            d={`M ${cx - headWidth + 4} ${mouthY - 2}
                C ${cx - headWidth - 1} ${chinY - 6}, ${cx - jawW - 2} ${chinY + 2}, ${cx} ${chinY + 4}
                C ${cx + jawW + 2} ${chinY + 2}, ${cx + headWidth + 1} ${chinY - 6}, ${cx + headWidth - 4} ${mouthY - 2}`}
            stroke={base} strokeWidth={sw + 0.5} fill="none" strokeLinecap="round" />
          <path
            d={`M ${cx - headWidth + 5} ${mouthY - 1}
                C ${cx - headWidth} ${chinY - 5}, ${cx - jawW - 1} ${chinY + 3}, ${cx} ${chinY + 5}
                C ${cx + jawW + 1} ${chinY + 3}, ${cx + headWidth} ${chinY - 5}, ${cx + headWidth - 5} ${mouthY - 1}`}
            stroke={shadow} strokeWidth={sw} fill="none" strokeLinecap="round" opacity={0.7} />
          {/* Scattered short hairs along the strap */}
          {Array.from({ length: 14 }).map((_, i) => {
            const t = (i + 0.5) / 14;
            const ang = Math.PI * t;
            const px = cx + Math.cos(ang) * (headWidth - 2) * (1 - t * 0.1);
            const py = mouthY - 2 + Math.sin(ang) * (chinY + 4 - mouthY + 4);
            return <circle key={`cs${i}`} cx={px} cy={py} r={0.6 + r() * 0.5} fill={base} opacity={0.7} />;
          })}
        </g>
      );
    }
    case 'stubble': {
      // A few days of growth — render as a shadow-filled region masked by fractal noise,
      // so the result reads as fine texture rather than a field of individual dots.
      const seed = Math.floor(rng() * 10000);
      const fid = `stb-${seed}`;
      const yMid = (mouthY + chinY) / 2 + 1;
      const yRad = (chinY - mouthY) / 2 + 4;
      return (
        <g key="stubble">
          <defs>
            <filter id={fid} x="-10%" y="-10%" width="120%" height="120%">
              <feTurbulence type="fractalNoise" baseFrequency="0.95" numOctaves="2" seed={seed} result="n" />
              {/* Map noise luminance to alpha with a hard threshold — keeps only the brighter speckles */}
              <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2.2 0 0 0 -0.7" result="mask" />
              <feComposite in="SourceGraphic" in2="mask" operator="in" />
            </filter>
          </defs>
          {/* Jaw & chin coverage — excludes the lip area */}
          <path d={`M ${cx - jawW} ${mouthY + 3}
              C ${cx - jawW - 1} ${chinY - 6}, ${cx - jawW * 0.5} ${chinY + 5}, ${cx} ${chinY + 6}
              C ${cx + jawW * 0.5} ${chinY + 5}, ${cx + jawW + 1} ${chinY - 6}, ${cx + jawW} ${mouthY + 3}
              C ${cx + jawW * 0.35} ${mouthY + 6}, ${cx - jawW * 0.35} ${mouthY + 6}, ${cx - jawW} ${mouthY + 3} Z`}
            fill={shadow} opacity={0.75} filter={`url(#${fid})`} />
          {/* Upper-lip / mustache shadow */}
          <ellipse cx={cx} cy={mouthY - 3.5} rx={12} ry={2.6}
            fill={shadow} opacity={0.7} filter={`url(#${fid})`} />
          {/* A faint soft wash underneath so the speckles sit on a hint of shadow, not bare skin */}
          <ellipse cx={cx} cy={yMid} rx={jawW - 2} ry={yRad}
            fill={shadow} opacity={0.08} />
        </g>
      );
    }
    case 'mustacheOnly':
      // No beard shape — just the mustache rendered separately by caller
      // But add a tiny bit of chin shadow to suggest stubble underneath
      return (
        <ellipse cx={cx} cy={chinY - 2} rx={jawW - 4} ry={6}
          fill={shadow} opacity={0.12} />
      );
  }
}

function renderMustacheShape(
  style: 'walrus' | 'handlebar' | 'imperial' | 'trimmed' | 'thin',
  cx: number, mouthY: number, rng: () => number,
  base: string, shadow: string, highlight: string,
): React.ReactNode {
  switch (style) {
    case 'walrus': {
      // Drooping, thick — covers the upper lip and droops past the corners
      const w = 16 + rng() * 5;
      const drop = 4 + rng() * 3;
      const thick = 4 + rng() * 1.5;
      const path = `M ${cx - w} ${mouthY - 2 + drop * 0.4}
        C ${cx - w * 0.6} ${mouthY - 6 - thick}, ${cx + w * 0.6} ${mouthY - 6 - thick}, ${cx + w} ${mouthY - 2 + drop * 0.4}
        L ${cx + w + 1} ${mouthY + drop}
        C ${cx + w * 0.4} ${mouthY + 1}, ${cx - w * 0.4} ${mouthY + 1}, ${cx - w - 1} ${mouthY + drop} Z`;
      return (
        <g key="must">
          <path d={path} fill={shadow} transform="translate(0,0.8)" opacity={0.85} />
          <path d={path} fill={base} />
          {/* Center groove under philtrum */}
          <path d={`M ${cx} ${mouthY - thick - 4} L ${cx} ${mouthY - 1}`}
            stroke={shadow} strokeWidth="0.6" opacity={0.55} />
          {/* Tip wisps drooping past corners */}
          <path d={`M ${cx - w - 1} ${mouthY + drop} l -2 ${1.5 + rng()}`}
            stroke={base} strokeWidth="1" strokeLinecap="round" />
          <path d={`M ${cx + w + 1} ${mouthY + drop} l 2 ${1.5 + rng()}`}
            stroke={base} strokeWidth="1" strokeLinecap="round" />
        </g>
      );
    }
    case 'handlebar': {
      // Curled-up tips — the dashing cavalier look
      const w = 14 + rng() * 5;
      const thick = 2.5 + rng() * 1.5;
      const curl = 4 + rng() * 2;
      const path = `M ${cx - w} ${mouthY - 2}
        C ${cx - w * 0.5} ${mouthY - 5 - thick}, ${cx + w * 0.5} ${mouthY - 5 - thick}, ${cx + w} ${mouthY - 2}
        C ${cx + w * 0.4} ${mouthY - 1}, ${cx - w * 0.4} ${mouthY - 1}, ${cx - w} ${mouthY - 2} Z`;
      return (
        <g key="must">
          <path d={path} fill={shadow} transform="translate(0,0.7)" opacity={0.85} />
          <path d={path} fill={base} />
          {/* Curled tips — thin tapered strokes that rise upward */}
          <path d={`M ${cx - w + 1} ${mouthY - 3}
              C ${cx - w - 3} ${mouthY - 4}, ${cx - w - curl} ${mouthY - 6}, ${cx - w - curl - 1} ${mouthY - 8}`}
            stroke={base} strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <path d={`M ${cx + w - 1} ${mouthY - 3}
              C ${cx + w + 3} ${mouthY - 4}, ${cx + w + curl} ${mouthY - 6}, ${cx + w + curl + 1} ${mouthY - 8}`}
            stroke={base} strokeWidth="1.6" fill="none" strokeLinecap="round" />
          {/* Highlight along upper edge */}
          <path d={`M ${cx - w + 3} ${mouthY - 4} Q ${cx} ${mouthY - 5 - thick * 0.6} ${cx + w - 3} ${mouthY - 4}`}
            stroke={highlight} strokeWidth="0.7" fill="none" opacity={0.45} />
        </g>
      );
    }
    case 'imperial': {
      // Narrow waxed mustache, sharply pointed — Charles I / Cardinal Richelieu look
      const w = 13 + rng() * 4;
      const thick = 1.6 + rng() * 0.8;
      const path = `M ${cx - w} ${mouthY - 2}
        C ${cx - w * 0.4} ${mouthY - 4 - thick}, ${cx + w * 0.4} ${mouthY - 4 - thick}, ${cx + w} ${mouthY - 2}
        C ${cx + w * 0.3} ${mouthY - 1}, ${cx - w * 0.3} ${mouthY - 1}, ${cx - w} ${mouthY - 2} Z`;
      return (
        <g key="must">
          <path d={path} fill={base} />
          {/* Sharp waxed points extending past corners */}
          <path d={`M ${cx - w + 1} ${mouthY - 3} l -5 -2`} stroke={base} strokeWidth="1.2" strokeLinecap="round" />
          <path d={`M ${cx + w - 1} ${mouthY - 3} l 5 -2`} stroke={base} strokeWidth="1.2" strokeLinecap="round" />
        </g>
      );
    }
    case 'trimmed': {
      // Neat compact mustache
      const w = 11 + rng() * 4;
      const thick = 2 + rng() * 1.5;
      const path = `M ${cx - w} ${mouthY - 2}
        C ${cx - w * 0.4} ${mouthY - 4 - thick}, ${cx + w * 0.4} ${mouthY - 4 - thick}, ${cx + w} ${mouthY - 2}
        C ${cx + w * 0.3} ${mouthY - 1}, ${cx - w * 0.3} ${mouthY - 1}, ${cx - w} ${mouthY - 2} Z`;
      return (
        <g key="must">
          <path d={path} fill={shadow} transform="translate(0,0.6)" opacity={0.8} />
          <path d={path} fill={base} />
          <path d={`M ${cx} ${mouthY - thick - 2} L ${cx} ${mouthY - 1}`}
            stroke={shadow} strokeWidth="0.5" opacity={0.5} />
        </g>
      );
    }
    case 'thin': {
      // Pencil mustache — barely there
      const w = 10 + rng() * 3;
      return (
        <path key="must"
          d={`M ${cx - w} ${mouthY - 2} Q ${cx} ${mouthY - 3.5} ${cx + w} ${mouthY - 2}`}
          stroke={base} strokeWidth="1.4" strokeLinecap="round" fill="none" />
      );
    }
  }
}

// Generate small hair strands radiating out from the bottom edge of a beard for fuzzy texture.
function strandsAlongCurve(
  x1: number, _y1: number, x2: number, _y2: number,
  apexX: number, apexY: number,
  count: number, rng: () => number,
  strandColor: string, baseColor: string, lengthBase: number,
): React.ReactNode {
  const strands: React.ReactNode[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    // Quadratic interpolation to find a point near the apex curve
    const px = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * apexX + t * t * x2;
    const py = (1 - t) * (1 - t) * _y1 + 2 * (1 - t) * t * apexY + t * t * _y2;
    const len = lengthBase * (0.6 + rng() * 0.8);
    // Direction roughly perpendicular to the curve, fanning slightly outward
    const dx = (px - apexX) * 0.2 + (rng() - 0.5) * 1.5;
    const dy = len * (0.7 + rng() * 0.4);
    const color = rng() > 0.5 ? strandColor : baseColor;
    strands.push(
      <path key={`st${i}`}
        d={`M ${px} ${py} l ${dx * 0.3} ${dy}`}
        stroke={color} strokeWidth="0.7" strokeLinecap="round" opacity={0.7 + rng() * 0.25} />
    );
  }
  return <g key="strands">{strands}</g>;
}

// ── Scar ─────────────────────────────────────────────────

function renderScar(
  config: PortraitConfig, rng: () => number,
  cx: number, eyeY: number, eyeSpacing: number,
): React.ReactNode {
  const side = rng() > 0.5 ? 1 : -1;
  // Scar color varies: older scars silver-pink, fresh scars redder.
  const fresh = rng() > 0.6;
  const scarStroke = fresh ? 'rgba(170,90,80,0.55)' : 'rgba(190,155,140,0.5)';
  const scarHighlight = fresh ? 'rgba(230,190,180,0.4)' : 'rgba(235,220,210,0.35)';
  // Gunners have a higher chance of powder burns (small black specks).
  const variantRoll = rng();
  const isGunner = config.role === 'Gunner';
  let variant: 'jaw' | 'brow' | 'cheek' | 'lip' | 'browThrough' | 'powder';
  if (isGunner && variantRoll > 0.75) variant = 'powder';
  else if (variantRoll > 0.82) variant = 'browThrough';
  else if (variantRoll > 0.62) variant = 'cheek';
  else if (variantRoll > 0.45) variant = 'lip';
  else if (variantRoll > 0.22) variant = 'brow';
  else variant = 'jaw';

  switch (variant) {
    case 'jaw': {
      // Original long slash running from cheek to jaw
      const sx = cx + side * (eyeSpacing + 5);
      const length = 9 + rng() * 5;
      return (
        <g key="scar">
          <path d={`M ${sx} ${eyeY + 6} l ${side * 7} ${length}`}
            stroke={scarStroke} strokeWidth="1.3" fill="none" strokeLinecap="round" />
          <path d={`M ${sx + side * 0.6} ${eyeY + 6.4} l ${side * 6.4} ${length - 0.8}`}
            stroke={scarHighlight} strokeWidth="0.5" fill="none" strokeLinecap="round" />
        </g>
      );
    }
    case 'brow': {
      // Short vertical nick through the outer brow end
      const sx = cx + side * (eyeSpacing + rng() * 3);
      return (
        <path key="scar" d={`M ${sx - 3} ${eyeY - 9} l ${1 + rng() * 2} ${8 + rng() * 3}`}
          stroke={scarStroke} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      );
    }
    case 'cheek': {
      // Diagonal across the cheekbone — classic blade-fight wound
      const sx = cx + side * (eyeSpacing + 3);
      const sy = eyeY + 10 + rng() * 4;
      const len = 10 + rng() * 6;
      return (
        <g key="scar">
          <path d={`M ${sx} ${sy} l ${side * len * 0.8} ${len * 0.5}`}
            stroke={scarStroke} strokeWidth="1.2" fill="none" strokeLinecap="round" />
          <path d={`M ${sx + side * 0.4} ${sy + 0.6} l ${side * (len * 0.8 - 0.8)} ${len * 0.5 - 0.6}`}
            stroke={scarHighlight} strokeWidth="0.45" fill="none" strokeLinecap="round" />
        </g>
      );
    }
    case 'lip': {
      // Vertical scar through the upper lip — the mouth-corner hook
      const sx = cx + side * (5 + rng() * 3);
      const sy = eyeY + 28 + rng() * 4;
      return (
        <path key="scar" d={`M ${sx} ${sy} l ${side * 0.6} ${6 + rng() * 2}`}
          stroke={scarStroke} strokeWidth="1.1" fill="none" strokeLinecap="round" />
      );
    }
    case 'browThrough': {
      // Cut straight through the brow — the iconic "split brow"
      const sx = cx + side * (eyeSpacing + 1);
      return (
        <g key="scar">
          <path d={`M ${sx - 3} ${eyeY - 13} l ${2 + rng() * 1.5} ${10 + rng() * 3}`}
            stroke={scarStroke} strokeWidth="1.6" fill="none" strokeLinecap="round" />
          {/* Small break in the brow line itself — rendered as a skin-tone gap */}
          <circle cx={sx - 1.5} cy={eyeY - 8} r={0.9} fill="rgba(235,215,195,0.7)" />
        </g>
      );
    }
    case 'powder': {
      // Powder burn / pitting — scattered dark specks on one cheek, gunner-specific
      const specks: React.ReactNode[] = [];
      const count = 5 + Math.floor(rng() * 6);
      const ox = cx + side * (eyeSpacing + 4);
      const oy = eyeY + 4;
      for (let i = 0; i < count; i++) {
        const dx = (rng() - 0.3) * 12 * side;
        const dy = rng() * 16 - 2;
        specks.push(
          <circle key={`pw${i}`} cx={ox + dx} cy={oy + dy}
            r={0.4 + rng() * 0.7} fill="rgba(30,20,15,0.55)" />
        );
      }
      return <g key="scar">{specks}</g>;
    }
  }
}

// ── Earring ──────────────────────────────────────────────

function renderEarring(
  rng: () => number, cx: number, eyeY: number, headWidth: number,
): React.ReactNode {
  const side = rng() > 0.5 ? 1 : -1;
  const ex = cx + side * (headWidth + 2);
  const ey = eyeY + 9;
  const isGold = rng() > 0.4;
  const color = isGold ? '#d4a020' : '#c0c0c0';
  return (
    <g key="earring">
      <circle cx={ex} cy={ey + 3} r={3} fill="none" stroke={color} strokeWidth="1.3" />
      {rng() > 0.5 && <circle cx={ex} cy={ey + 7} r={1.2} fill={color} />}
    </g>
  );
}

// ── Back hair ────────────────────────────────────────────

function renderBackHair(
  config: PortraitConfig, rng: () => number,
  cx: number, headTop: number, hw: number, eyeY: number, chinY: number, hairColor: string,
): React.ReactNode {
  if (config.gender === 'Female') {
    // Hair tucked behind the ears, ending around the upper neck — never extends
    // past the chin (which created a "hood with ear flaps" silhouette in head-crop view).
    // Most 1612 European women wore hair gathered up under a coif/hood anyway.
    const styleRoll = rng();
    if (styleRoll > 0.5) {
      // Gathered/bun — minimal back hair visible
      return (
        <g key="back-hair">
          <path d={`M ${cx - hw - 2} ${headTop + 18}
              C ${cx - hw - 6} ${headTop + 45}, ${cx - hw - 3} ${headTop + 70}, ${cx - hw + 4} ${headTop + 78}
              L ${cx + hw - 4} ${headTop + 78}
              C ${cx + hw + 3} ${headTop + 70}, ${cx + hw + 6} ${headTop + 45}, ${cx + hw + 2} ${headTop + 18} Z`}
            fill={hairColor} />
          {/* Bun at the back */}
          <ellipse cx={cx} cy={headTop + 22} rx={hw * 0.6} ry={10} fill={hairColor} opacity={0.92} />
        </g>
      );
    }
    // Loose shoulder-length — stops at the jaw, doesn't drape past
    return (
      <path key="back-hair"
        d={`M ${cx - hw - 4} ${headTop + 18}
            C ${cx - hw - 8} ${headTop + 50}, ${cx - hw - 6} ${headTop + 80}, ${cx - hw + 2} ${headTop + 92}
            L ${cx + hw - 2} ${headTop + 92}
            C ${cx + hw + 6} ${headTop + 80}, ${cx + hw + 8} ${headTop + 50}, ${cx + hw + 4} ${headTop + 18} Z`}
        fill={hairColor} />
    );
  }
  if ((config.culturalGroup === 'EastAsian' || config.culturalGroup === 'SoutheastAsian') && rng() > 0.6) {
    return (
      <path key="back-hair"
        d={`M ${cx - hw - 2} ${headTop + 20}
            C ${cx - hw - 8} ${headTop + 60}, ${cx - hw - 6} ${headTop + 100}, ${cx - hw + 2} ${headTop + 115}
            L ${cx + hw - 2} ${headTop + 115}
            C ${cx + hw + 6} ${headTop + 100}, ${cx + hw + 8} ${headTop + 60}, ${cx + hw + 2} ${headTop + 20} Z`}
        fill={hairColor} />
    );
  }
  // ── European / generic male side hair ──
  // In 1612 most European men wore hair at least collar-length. A wavy strip down the temples
  // and sides flows past the jaw — this is what peeks out below a hat brim and past the ears.
  // Cultural groups with their own distinctive styles are excluded.
  const excludedGroups = ['ArabPersian', 'Indian', 'EastAsian', 'SoutheastAsian', 'Swahili'];
  if (config.gender === 'Male' && !excludedGroups.includes(config.culturalGroup)) {
    const age = ['20s', '30s', '40s', '50s', '60s'].indexOf(config.age);
    const baldness = getBaldnessPattern(config);
    // Fully bald — only a whisper of hair at the nape/temples.
    if (baldness === 'bald') {
      // Two small tufts behind the ears.
      const tuftL = `M ${cx - hw + 2} ${eyeY + 6}
          C ${cx - hw - 3} ${eyeY + 14}, ${cx - hw - 2} ${eyeY + 22}, ${cx - hw + 4} ${eyeY + 20}
          C ${cx - hw + 2} ${eyeY + 14}, ${cx - hw + 3} ${eyeY + 8}, ${cx - hw + 2} ${eyeY + 6} Z`;
      const tuftR = `M ${cx + hw - 2} ${eyeY + 6}
          C ${cx + hw + 3} ${eyeY + 14}, ${cx + hw + 2} ${eyeY + 22}, ${cx + hw - 4} ${eyeY + 20}
          C ${cx + hw - 2} ${eyeY + 14}, ${cx + hw - 3} ${eyeY + 8}, ${cx + hw - 2} ${eyeY + 6} Z`;
      return (
        <g key="back-hair">
          <path d={tuftL} fill={hairColor} opacity={0.9} />
          <path d={tuftR} fill={hairColor} opacity={0.9} />
        </g>
      );
    }
    // Balding (monk's fringe) — crown bare, but full side/back hair remains; force short.
    const short = baldness === 'balding' ? true : (age >= 3 && rng() > 0.45);
    const long = !short && baldness !== 'balding' && rng() > 0.5;
    const flare = 5 + rng() * 3;                                 // extends well past the cheek line
    const bottomY = long ? chinY + 14 : short ? eyeY + 12 : eyeY + (chinY - eyeY) * 0.55;
    const wave = (rng() - 0.5) * 2;

    // One closed shape per side. The inner edge hugs the head; the outer edge swings out
    // past the cheek (flare) so the hair reads through the brim/face overlay.
    const leftPath = `M ${cx - hw + 1} ${headTop + 4}
        C ${cx - hw - flare} ${eyeY - 18}, ${cx - hw - flare + wave} ${eyeY + 2}, ${cx - hw - flare * 0.6} ${bottomY - 4}
        L ${cx - hw + 4} ${bottomY}
        C ${cx - hw - 1} ${eyeY + 6}, ${cx - hw + 1} ${eyeY - 14}, ${cx - hw + 1} ${headTop + 4} Z`;
    const rightPath = `M ${cx + hw - 1} ${headTop + 4}
        C ${cx + hw + flare} ${eyeY - 18}, ${cx + hw + flare - wave} ${eyeY + 2}, ${cx + hw + flare * 0.6} ${bottomY - 4}
        L ${cx + hw - 4} ${bottomY}
        C ${cx + hw + 1} ${eyeY + 6}, ${cx + hw - 1} ${eyeY - 14}, ${cx + hw - 1} ${headTop + 4} Z`;

    return (
      <g key="back-hair">
        <path d={leftPath} fill={hairColor} />
        <path d={rightPath} fill={hairColor} />
        {/* Strand accents along the outer edge — keeps it from looking like a solid helmet */}
        <path d={`M ${cx - hw - flare * 0.9} ${eyeY - 10} Q ${cx - hw - flare} ${eyeY + 4} ${cx - hw - flare * 0.5} ${bottomY - 6}`}
          stroke="rgba(0,0,0,0.2)" strokeWidth="0.6" fill="none" />
        <path d={`M ${cx + hw + flare * 0.9} ${eyeY - 10} Q ${cx + hw + flare} ${eyeY + 4} ${cx + hw + flare * 0.5} ${bottomY - 6}`}
          stroke="rgba(0,0,0,0.2)" strokeWidth="0.6" fill="none" />
      </g>
    );
  }
  return null;
}

// ── Front hair ───────────────────────────────────────────

// Deterministic baldness pattern for European men — derived from seed so it's stable
// without consuming the shared RNG stream.
type Baldness = 'none' | 'receding' | 'balding' | 'bald';
function getBaldnessPattern(config: PortraitConfig): Baldness {
  if (config.gender !== 'Male') return 'none';
  if (config.culturalGroup !== 'NorthEuropean' && config.culturalGroup !== 'SouthEuropean') return 'none';
  const age = ['20s', '30s', '40s', '50s', '60s'].indexOf(config.age);
  if (age < 1) return 'none';
  // Stable 0..1 roll, independent of the main rng stream.
  const roll = ((Math.abs(config.seed) >> 11) & 0xFFFF) / 65535;
  if (age === 1) {                // 30s — a few receding, no balding
    if (roll < 0.15) return 'receding';
    return 'none';
  }
  if (age === 2) {                // 40s
    if (roll < 0.30) return 'receding';
    if (roll < 0.40) return 'balding';
    return 'none';
  }
  if (age === 3) {                // 50s
    if (roll < 0.25) return 'receding';
    if (roll < 0.55) return 'balding';
    if (roll < 0.65) return 'bald';
    return 'none';
  }
  // 60s
  if (roll < 0.20) return 'receding';
  if (roll < 0.55) return 'balding';
  if (roll < 0.80) return 'bald';
  return 'none';
}

function renderFrontHair(
  config: PortraitConfig, rng: () => number,
  cx: number, headTop: number, hw: number, eyeY: number,
  foreheadH: number, hairColor: string,
): React.ReactNode {
  if (willHaveFullHeadwear(config, rng)) return null;
  const age = ['20s', '30s', '40s', '50s', '60s'].indexOf(config.age);
  const baldness = getBaldnessPattern(config);
  // Fully bald / monk's fringe — no front hair at all. Sides render from renderBackHair.
  if (baldness === 'bald' || baldness === 'balding') return null;
  if (baldness === 'receding') {
    // M-pattern: temples pulled back, a modest central forelock/widow's peak between.
    const severity = age <= 1 ? 0.55 : age === 2 ? 0.85 : 1;
    const templeRecess = 8 + severity * 6;          // vertical pull-back at temples
    const templePullIn = hw * (0.55 - severity * 0.1);  // horizontal position of the temple indent
    const peakY = headTop + 2 + severity * 2;       // central forelock top
    const templeY = headTop + templeRecess;
    // Subtle widow's-peak dip in the middle (reads as a V rather than flat)
    const widowDip = 1.5 + severity * 1.5;
    return (
      <path key="front-hair"
        d={`M ${cx - hw - 2} ${eyeY - 12}
            C ${cx - hw - 2} ${headTop + 4}, ${cx - templePullIn - 4} ${templeY - 2}, ${cx - templePullIn} ${templeY}
            C ${cx - templePullIn + 2} ${peakY + 4}, ${cx - 4} ${peakY + widowDip}, ${cx} ${peakY + widowDip + 0.5}
            C ${cx + 4} ${peakY + widowDip}, ${cx + templePullIn - 2} ${peakY + 4}, ${cx + templePullIn} ${templeY}
            C ${cx + templePullIn + 4} ${templeY - 2}, ${cx + hw + 2} ${headTop + 4}, ${cx + hw + 2} ${eyeY - 12}
            C ${cx + hw + 4} ${headTop + 2}, ${cx + hw * 0.5} ${headTop - 4}, ${cx} ${headTop - 4}
            C ${cx - hw * 0.5} ${headTop - 4}, ${cx - hw - 4} ${headTop + 2}, ${cx - hw - 2} ${eyeY - 12} Z`}
        fill={hairColor} />
    );
  }

  // Swahili short textured hair
  if (config.culturalGroup === 'Swahili' && config.gender === 'Male') {
    const dots: React.ReactNode[] = [];
    for (let i = 0; i < 40; i++) {
      const angle = rng() * Math.PI * 2;
      const dist = rng() * (hw - 4);
      const hx = cx + Math.cos(angle) * dist * 0.9;
      const hy = headTop + 6 + Math.sin(angle) * dist * 0.35;
      if (hy < eyeY - 8) {
        dots.push(<circle key={`hd-${i}`} cx={hx} cy={hy} r={1.2 + rng() * 0.8} fill={hairColor} opacity={0.7 + rng() * 0.3} />);
      }
    }
    // Base cap shape
    return (
      <g key="front-hair">
        <path
          d={`M ${cx - hw - 2} ${eyeY - 10}
              C ${cx - hw - 2} ${headTop + 2}, ${cx} ${headTop - 4}, ${cx} ${headTop - 3}
              C ${cx} ${headTop - 4}, ${cx + hw + 2} ${headTop + 2}, ${cx + hw + 2} ${eyeY - 10}
              C ${cx + hw + 3} ${headTop + 1}, ${cx} ${headTop - 5}, ${cx} ${headTop - 5}
              C ${cx} ${headTop - 5}, ${cx - hw - 3} ${headTop + 1}, ${cx - hw - 2} ${eyeY - 10} Z`}
          fill={hairColor} opacity={0.85}
        />
        {dots}
      </g>
    );
  }

  if (config.gender === 'Female') {
    // Center-parted hair, smoothed back over the crown — typical 1612 European style
    // (hair would normally be gathered under a coif/hood, drawn separately in renderHeadwear).
    const partSide = rng() > 0.5 ? -1 : 1;
    const partOffset = partSide * 2;
    return (
      <g key="front-hair">
        {/* Crown sweep — covers the top of the head, parted slightly off-center */}
        <path
          d={`M ${cx - hw - 2} ${eyeY - 8}
              C ${cx - hw - 3} ${headTop + 4}, ${cx - hw * 0.4} ${headTop - 2}, ${cx + partOffset} ${headTop - 1}
              C ${cx + hw * 0.4} ${headTop - 2}, ${cx + hw + 3} ${headTop + 4}, ${cx + hw + 2} ${eyeY - 8}
              C ${cx + hw - 4} ${headTop + foreheadH * 0.6}, ${cx + 6} ${headTop + foreheadH * 0.4}, ${cx + partOffset} ${headTop + foreheadH * 0.3}
              C ${cx - 6} ${headTop + foreheadH * 0.4}, ${cx - hw + 4} ${headTop + foreheadH * 0.6}, ${cx - hw - 2} ${eyeY - 8} Z`}
          fill={hairColor} />
        {/* Subtle part line — slight darker shadow along the parting */}
        <path d={`M ${cx + partOffset} ${headTop} L ${cx + partOffset + partSide * 1} ${headTop + foreheadH * 0.3}`}
          stroke="rgba(0,0,0,0.18)" strokeWidth="0.6" fill="none" />
      </g>
    );
  }

  if (config.culturalGroup === 'EastAsian' && rng() > 0.4) {
    return (
      <path key="front-hair"
        d={`M ${cx - hw + 8} ${headTop + 12}
            C ${cx - hw + 2} ${headTop}, ${cx} ${headTop - 6}, ${cx + hw - 2} ${headTop}
            L ${cx + hw - 8} ${headTop + 12}
            C ${cx + hw - 12} ${headTop + 4}, ${cx - hw + 12} ${headTop + 4}, ${cx - hw + 8} ${headTop + 12} Z`}
        fill={hairColor} />
    );
  }

  if (age >= 3) {
    const recede = (age - 2) * 4;
    return (
      <path key="front-hair"
        d={`M ${cx - hw - 2} ${eyeY - 12}
            C ${cx - hw - 2} ${headTop + 6}, ${cx - hw * 0.3} ${headTop - 2 + recede}, ${cx} ${headTop + recede * 0.5}
            C ${cx + hw * 0.3} ${headTop - 2 + recede}, ${cx + hw + 2} ${headTop + 6}, ${cx + hw + 2} ${eyeY - 12}
            C ${cx + hw + 4} ${headTop + 4}, ${cx + hw * 0.5} ${headTop - 4}, ${cx} ${headTop - 4}
            C ${cx - hw * 0.5} ${headTop - 4}, ${cx - hw - 4} ${headTop + 4}, ${cx - hw - 2} ${eyeY - 12} Z`}
        fill={hairColor} />
    );
  }

  const waviness = rng() * 4;
  return (
    <path key="front-hair"
      d={`M ${cx - hw - 3} ${eyeY - 10}
          C ${cx - hw - 3} ${headTop + 4}, ${cx - hw * 0.3} ${headTop - 4 + waviness}, ${cx} ${headTop - 2}
          C ${cx + hw * 0.3} ${headTop - 4 - waviness}, ${cx + hw + 3} ${headTop + 4}, ${cx + hw + 3} ${eyeY - 10}
          C ${cx + hw + 5} ${headTop + 2}, ${cx + hw * 0.5} ${headTop - 6}, ${cx} ${headTop - 6}
          C ${cx - hw * 0.5} ${headTop - 6}, ${cx - hw - 5} ${headTop + 2}, ${cx - hw - 3} ${eyeY - 10} Z`}
      fill={hairColor} />
  );
}

// ── Headwear ─────────────────────────────────────────────

function willHaveFullHeadwear(config: PortraitConfig, _rng: () => number): boolean {
  if (config.culturalGroup === 'ArabPersian' && config.gender === 'Male') return true;
  if (config.culturalGroup === 'Indian' && config.gender === 'Male') return true;
  return false;
}

function renderHeadwear(
  config: PortraitConfig, rng: () => number,
  cx: number, headTop: number, hw: number, eyeY: number,
  _foreheadH: number, hairColor: string,
): React.ReactNode {
  const { culturalGroup, socialClass, gender, nationality } = config;

  if ((culturalGroup === 'ArabPersian' || culturalGroup === 'Indian') && gender === 'Male') {
    const turbanColor = socialClass === 'Noble'
      ? (nationality === 'Ottoman' ? '#f0f0f0' : nationality === 'Persian' ? '#3a6a8a' : '#c42020')
      : rng() > 0.5 ? '#d4c4b0' : '#b8a890';
    const turbanH = 22 + rng() * 10;
    return (
      <g key="turban">
        <path d={`M ${cx - hw - 6} ${headTop + 8}
            C ${cx - hw - 8} ${headTop - turbanH}, ${cx + hw + 8} ${headTop - turbanH}, ${cx + hw + 6} ${headTop + 8}
            C ${cx + hw + 2} ${headTop + 14}, ${cx - hw - 2} ${headTop + 14}, ${cx - hw - 6} ${headTop + 8} Z`}
          fill={turbanColor} />
        <path d={`M ${cx - hw - 3} ${headTop + 6} Q ${cx} ${headTop - turbanH + 8} ${cx + hw + 3} ${headTop + 4}`}
          stroke="rgba(0,0,0,0.15)" strokeWidth="2.5" fill="none" />
        <path d={`M ${cx - hw} ${headTop} Q ${cx} ${headTop - turbanH + 14} ${cx + hw} ${headTop - 2}`}
          stroke="rgba(0,0,0,0.12)" strokeWidth="2.5" fill="none" />
        <path d={`M ${cx - hw + 4} ${headTop - 6} Q ${cx} ${headTop - turbanH + 20} ${cx + hw - 4} ${headTop - 8}`}
          stroke="rgba(0,0,0,0.1)" strokeWidth="2" fill="none" />
        {socialClass === 'Noble' && (
          <g>
            <circle cx={cx} cy={headTop - 2} r={3.5} fill="#ffd700" />
            <circle cx={cx} cy={headTop - 2} r={1.8} fill={rng() > 0.5 ? '#e02020' : '#2060e0'} />
          </g>
        )}
      </g>
    );
  }

  if (culturalGroup === 'SoutheastAsian' && gender === 'Male' && rng() > 0.4) {
    const kopColor = rng() > 0.5 ? '#1a1a1a' : '#4a2020';
    return (
      <g key="kopiah">
        <path d={`M ${cx - hw + 4} ${headTop + 4} L ${cx - hw + 2} ${headTop - 12}
            C ${cx - hw + 2} ${headTop - 18}, ${cx + hw - 2} ${headTop - 18}, ${cx + hw - 2} ${headTop - 12}
            L ${cx + hw - 4} ${headTop + 4} Z`}
          fill={kopColor} />
        <path d={`M ${cx - hw + 2} ${headTop + 4} L ${cx + hw - 2} ${headTop + 4}`}
          stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
      </g>
    );
  }

  if (culturalGroup === 'EastAsian' && gender === 'Male' && rng() > 0.3) {
    return (
      <g key="topknot">
        <ellipse cx={cx} cy={headTop - 4} rx={7} ry={5} fill={hairColor} />
        <path d={`M ${cx - 3} ${headTop - 2} L ${cx} ${headTop - 14} L ${cx + 3} ${headTop - 2}`} fill={hairColor} />
      </g>
    );
  }

  // ── European male hats ──
  // Hats signified rank in 1612. Captains, merchants, and gentlemen were rarely bareheaded;
  // common sailors and labourers usually were — a broad felt hat aboard ship was an officer's mark.
  const isEurMale = (culturalGroup === 'NorthEuropean' || culturalGroup === 'SouthEuropean') && gender === 'Male';
  if (isEurMale) {
    const ageIdx = ['20s', '30s', '40s', '50s', '60s'].indexOf(config.age);
    let hatProb: number;
    if (config.role === 'Captain') hatProb = 0.90;
    else if (socialClass === 'Noble') hatProb = 0.85;
    else if (socialClass === 'Merchant') hatProb = 0.70;
    else if (config.isSailor) hatProb = 0.18;           // most common sailors: bareheaded
    else hatProb = 0.30;                                 // other working-class: usually bareheaded
    if (ageIdx >= 3 && (socialClass === 'Noble' || socialClass === 'Merchant' || config.role === 'Captain')) {
      hatProb = Math.min(0.95, hatProb + 0.08);
    }

    if (rng() < hatProb) {
      const r = rng();
      // Captains, nobles, factors → wide-brim cavalier or capotain
      if (config.role === 'Captain' || socialClass === 'Noble' || socialClass === 'Merchant') {
        if (r < 0.6) {
          return renderWideBrimHat(cx, headTop, hw, eyeY, rng, socialClass);
        } else if (r < 0.88) {
          return renderCapotain(cx, headTop, hw, eyeY, rng, socialClass);
        } else {
          return renderCoif(cx, headTop, hw, eyeY, rng);
        }
      }
      // Sailors / working class → occasional knit cap only; otherwise just the hair shows.
      return renderMonmouthCap(cx, headTop, hw, eyeY, rng);
    }
  }

  // ── European female headcoverings — c. 1612, virtually all women wore something on the head ──
  const isEurFemale = (culturalGroup === 'NorthEuropean' || culturalGroup === 'SouthEuropean') && gender === 'Female';
  if (isEurFemale) {
    if (socialClass === 'Noble') {
      // French hood — black velvet semi-circle worn back from the forehead, with a billiment band
      const veil = '#0e0c10';
      return (
        <g key="french-hood">
          {/* Veil falling behind the head */}
          <path d={`M ${cx - hw - 2} ${eyeY - 4}
              C ${cx - hw - 6} ${headTop + 18}, ${cx - hw - 4} ${headTop + 50}, ${cx - hw + 6} ${headTop + 70}
              L ${cx + hw - 6} ${headTop + 70}
              C ${cx + hw + 4} ${headTop + 50}, ${cx + hw + 6} ${headTop + 18}, ${cx + hw + 2} ${eyeY - 4} Z`}
            fill={veil} />
          {/* Hood front arc — sits back from the forehead showing front hair */}
          <path d={`M ${cx - hw - 4} ${eyeY - 8}
              C ${cx - hw - 4} ${headTop + 4}, ${cx + hw + 4} ${headTop + 4}, ${cx + hw + 4} ${eyeY - 8}
              C ${cx + hw - 6} ${headTop + 12}, ${cx - hw + 6} ${headTop + 12}, ${cx - hw - 4} ${eyeY - 8} Z`}
            fill={veil} />
          {/* Billiment — gold/pearl band along the hood front */}
          <path d={`M ${cx - hw - 3} ${eyeY - 9} C ${cx - hw - 3} ${headTop + 3}, ${cx + hw + 3} ${headTop + 3}, ${cx + hw + 3} ${eyeY - 9}`}
            stroke="#d4b060" strokeWidth="2" fill="none" />
          {/* Pearl dots along billiment */}
          {[-0.8, -0.4, 0, 0.4, 0.8].map((t, i) => {
            const px = cx + t * (hw + 2);
            const py = headTop + 4 - Math.cos(t * Math.PI / 2) * (eyeY - headTop - 12);
            return <circle key={`p${i}`} cx={px} cy={py} r={1.2} fill="#f8f0e0" stroke="#a89060" strokeWidth="0.3" />;
          })}
        </g>
      );
    }
    // Merchant or Working — linen coif, the universal women's cap
    const linen = socialClass === 'Merchant' ? '#f5efde' : '#ebe3d0';
    return (
      <g key="coif">
        <path d={`M ${cx - hw - 3} ${eyeY - 4}
            C ${cx - hw - 5} ${headTop - 2}, ${cx + hw + 5} ${headTop - 2}, ${cx + hw + 3} ${eyeY - 4}
            C ${cx + hw + 4} ${eyeY + 16}, ${cx + hw + 4} ${eyeY + 38}, ${cx + hw} ${eyeY + 54}
            L ${cx - hw} ${eyeY + 54}
            C ${cx - hw - 4} ${eyeY + 38}, ${cx - hw - 4} ${eyeY + 16}, ${cx - hw - 3} ${eyeY - 4} Z`}
          fill={linen} stroke="#bdb29a" strokeWidth="0.7" />
        {/* Center seam */}
        <path d={`M ${cx} ${headTop - 1} L ${cx} ${eyeY - 6}`} stroke="rgba(0,0,0,0.08)" strokeWidth="0.6" />
        {/* Subtle fold shadow at the brow */}
        <path d={`M ${cx - hw - 1} ${eyeY - 6} Q ${cx} ${headTop + 6} ${cx + hw + 1} ${eyeY - 6}`}
          stroke="rgba(0,0,0,0.1)" strokeWidth="0.6" fill="none" />
        {socialClass === 'Merchant' && (
          <path d={`M ${cx - hw - 1} ${eyeY - 5} Q ${cx} ${headTop + 5} ${cx + hw + 1} ${eyeY - 5}`}
            stroke="#d4b070" strokeWidth="0.5" fill="none" opacity={0.5} />
        )}
      </g>
    );
  }

  return null;
}

// ── 1612 European male hats ──────────────────────────────

// Wide-brim cavalier / "slouch" felt hat — by far the most common gentleman's hat c.1610s.
// Broad flat brim, rounded crown, hat band, optional feather sweeping back.
function renderWideBrimHat(
  cx: number, headTop: number, hw: number, eyeY: number, rng: () => number, socialClass: SocialClass,
): React.ReactNode {
  const feltOptions = socialClass === 'Noble'
    ? ['#141214', '#1a1418', '#1c1410', '#221610']
    : ['#2a2018', '#3a2a20', '#1a1a1a', '#3a2818'];
  const felt = feltOptions[Math.floor(rng() * feltOptions.length)];
  // Brim rests just above the brow (cavalier hats sat low on the forehead).
  const brimY = eyeY - 22 - rng() * 3;
  const brimRx = hw + 16 + rng() * 6;
  const brimRy = 4.5 + rng() * 1.5;
  // Crown must rise above headTop to look like it sits on the skull, not inside it.
  const crownH = (brimY - headTop) + 10 + rng() * 8;
  const crownBase = brimY - 1;
  const crownTop = crownBase - crownH;
  const crownHalfWidth = hw + 2;
  const featherSide = rng() > 0.5 ? 1 : -1;
  const hasFeather = rng() > 0.3;
  const featherColor = ['#c83020', '#e0a020', '#f0e8d0', '#1a4a8a', '#80a040'][Math.floor(rng() * 5)];
  const bandColor = socialClass === 'Noble'
    ? (rng() > 0.5 ? '#c8a040' : '#7a1818')
    : '#0e0a08';

  return (
    <g key="wide-brim">
      {/* Cast shadow on forehead */}
      <ellipse cx={cx} cy={brimY + 2} rx={brimRx - 6} ry={3} fill="rgba(0,0,0,0.22)" />
      {/* Brim — single solid ellipse, broad and flat */}
      <ellipse cx={cx} cy={brimY} rx={brimRx} ry={brimRy} fill={felt} />
      {/* Brim top highlight */}
      <ellipse cx={cx} cy={brimY - brimRy * 0.5} rx={brimRx * 0.95} ry={brimRy * 0.4}
        fill="rgba(255,240,210,0.08)" />
      {/* Crown — domed felt sitting on the brim */}
      <path d={`M ${cx - crownHalfWidth} ${brimY - 1}
          C ${cx - crownHalfWidth - 2} ${crownTop + 8}, ${cx - crownHalfWidth + 4} ${crownTop}, ${cx} ${crownTop - 1}
          C ${cx + crownHalfWidth - 4} ${crownTop}, ${cx + crownHalfWidth + 2} ${crownTop + 8}, ${cx + crownHalfWidth} ${brimY - 1} Z`}
        fill={felt} />
      {/* Crown highlight on lit side */}
      <path d={`M ${cx + 4} ${crownTop + 4} Q ${cx + crownHalfWidth - 4} ${crownTop + 6} ${cx + crownHalfWidth - 2} ${brimY - 3}`}
        stroke="rgba(255,240,210,0.12)" strokeWidth="1.5" fill="none" />
      {/* Hat band — wraps the base of the crown */}
      <rect x={cx - crownHalfWidth + 1} y={brimY - 5} width={(crownHalfWidth - 1) * 2} height={3.5} fill={bandColor} />
      {socialClass === 'Noble' && (
        <rect x={cx - crownHalfWidth + 1} y={brimY - 5.5} width={(crownHalfWidth - 1) * 2} height={0.8}
          fill="#d4b060" opacity={0.6} />
      )}
      {/* Feather — sweeps from the band up and to the back */}
      {hasFeather && (() => {
        const fx = cx + featherSide * (crownHalfWidth - 4);
        const fy = brimY - 4;
        const tipX = cx + featherSide * (crownHalfWidth + 18);
        const tipY = crownTop - 6;
        return (
          <g key="feather">
            {/* Quill */}
            <path d={`M ${fx} ${fy} Q ${cx + featherSide * (crownHalfWidth + 4)} ${crownTop - 2} ${tipX} ${tipY}`}
              stroke={featherColor} strokeWidth="3.5" fill="none" strokeLinecap="round" />
            {/* Vane shading */}
            <path d={`M ${fx + featherSide * 2} ${fy - 1} Q ${cx + featherSide * (crownHalfWidth + 6)} ${crownTop - 4} ${tipX + featherSide * 2} ${tipY - 1}`}
              stroke={featherColor} strokeWidth="2" fill="none" strokeLinecap="round" opacity={0.7} />
            {/* Tip wisps */}
            {[0, 1, 2].map(i => (
              <path key={`vw${i}`}
                d={`M ${tipX - featherSide * i * 3} ${tipY + i * 2} l ${featherSide * 4} -2`}
                stroke={featherColor} strokeWidth="0.9" opacity={0.5} />
            ))}
          </g>
        );
      })()}
    </g>
  );
}

// Capotain — the iconic "Puritan" steeple-crowned hat, also worn widely by merchants and
// gentlemen across Protestant Europe c.1590-1640. Stiff felt, narrow flat brim, tall tapered crown.
function renderCapotain(
  cx: number, headTop: number, hw: number, eyeY: number, rng: () => number, socialClass: SocialClass,
): React.ReactNode {
  const felt = socialClass === 'Noble' ? '#0e0e10' : (rng() > 0.5 ? '#1a1410' : '#241810');
  // Brim rests on the brow. Capotain brims were narrow and flat.
  const brimY = eyeY - 20 - rng() * 3;
  const brimW = hw + 6 + rng() * 4;
  // Crown rises moderately above the skull — period capotains were taller than cavalier hats
  // but not stovepipes. Cap rise above headTop at ~14–22px.
  const riseAboveSkull = 14 + rng() * 8;
  const crownH = (brimY - headTop) + riseAboveSkull;
  const taper = 3 + rng() * 2;
  const crownBase = brimY - 1;
  const crownTop = crownBase - crownH;
  const crownHalfWidth = hw + 1;
  const tilt = (rng() - 0.5) * 3;
  const hasBuckle = socialClass === 'Noble' || rng() > 0.5;

  return (
    <g key="capotain" transform={`rotate(${tilt} ${cx} ${brimY})`}>
      <ellipse cx={cx} cy={brimY + 3} rx={brimW - 2} ry={3} fill="rgba(0,0,0,0.2)" />
      {/* Brim — flat, narrow */}
      <ellipse cx={cx} cy={brimY} rx={brimW} ry={3.5} fill={felt} />
      <ellipse cx={cx} cy={brimY + 1} rx={brimW - 1} ry={1.5} fill="rgba(0,0,0,0.3)" />
      {/* Crown — tall, slightly tapered upward */}
      <path d={`M ${cx - crownHalfWidth} ${crownBase}
          L ${cx - crownHalfWidth + taper} ${crownTop + 2}
          C ${cx - crownHalfWidth + taper} ${crownTop - 2}, ${cx + crownHalfWidth - taper} ${crownTop - 2}, ${cx + crownHalfWidth - taper} ${crownTop + 2}
          L ${cx + crownHalfWidth} ${crownBase} Z`}
        fill={felt} />
      {/* Crown highlight strip */}
      <path d={`M ${cx - crownHalfWidth + 2 + taper} ${crownTop + 6} L ${cx - crownHalfWidth + 3 + taper} ${crownBase - 2}`}
        stroke="rgba(255,240,210,0.1)" strokeWidth="1.5" fill="none" />
      {/* Hat band */}
      <rect x={cx - crownHalfWidth + 1} y={brimY - 4} width={(crownHalfWidth - 1) * 2} height={3} fill="#0a0608" />
      {/* Buckle (Puritan signature) */}
      {hasBuckle && (
        <g>
          <rect x={cx - 3} y={brimY - 4.5} width={6} height={4} fill="none" stroke="#d4b060" strokeWidth="0.8" />
          <rect x={cx - 1.5} y={brimY - 3.5} width={3} height={2} fill="#d4b060" opacity={0.4} />
        </g>
      )}
    </g>
  );
}

// Coif / linen skullcap — close-fitting cap tied under the chin, common for older men,
// scholars, and indoor wear. Plain white linen.
function renderCoif(
  cx: number, headTop: number, hw: number, eyeY: number, rng: () => number,
): React.ReactNode {
  const linen = rng() > 0.5 ? '#f0ebde' : '#e6dfce';
  return (
    <g key="coif">
      {/* Cap covering top and sides of head */}
      <path d={`M ${cx - hw - 2} ${eyeY - 6}
          C ${cx - hw - 4} ${headTop - 2}, ${cx + hw + 4} ${headTop - 2}, ${cx + hw + 2} ${eyeY - 6}
          C ${cx + hw - 2} ${eyeY - 4}, ${cx - hw + 2} ${eyeY - 4}, ${cx - hw - 2} ${eyeY - 6} Z`}
        fill={linen} stroke="#bdb29a" strokeWidth="0.6" />
      {/* Center seam */}
      <path d={`M ${cx} ${headTop - 1} L ${cx} ${eyeY - 8}`} stroke="rgba(0,0,0,0.08)" strokeWidth="0.6" />
      {/* Subtle fold shadow */}
      <path d={`M ${cx - hw} ${eyeY - 8} Q ${cx} ${headTop + 4} ${cx + hw} ${eyeY - 8}`}
        stroke="rgba(0,0,0,0.06)" strokeWidth="1" fill="none" />
    </g>
  );
}

// Monmouth cap — knitted wool sailor's cap, the standard 1612 mariner's headwear.
// Round dome, rolled brim. Brown, dark blue, or russet.
function renderMonmouthCap(
  cx: number, headTop: number, hw: number, eyeY: number, rng: () => number,
): React.ReactNode {
  const palette = ['#3a2818', '#2a3a4a', '#1a2030', '#5c2a18', '#3a3828', '#4a3818'];
  const wool = palette[Math.floor(rng() * palette.length)];
  const apexLean = (rng() - 0.5) * 4;
  // Monmouth caps were close-fitting knitted wool, pulled snug over the brow.
  // Apex sits just above the skull — not a tall cap.
  const brimY = eyeY - 18 - rng() * 3;
  const apexY = headTop - 3 - rng() * 3;
  const capHalfWidth = hw + 3;

  return (
    <g key="monmouth">
      {/* Cast shadow on forehead */}
      <ellipse cx={cx} cy={brimY - 1} rx={capHalfWidth} ry={2.8} fill="rgba(0,0,0,0.22)" />
      {/* Main cap dome — sweeps from the low brim up and over the skull to the apex */}
      <path d={`M ${cx - capHalfWidth} ${brimY}
          C ${cx - capHalfWidth - 2} ${headTop + 4}, ${cx - hw + 2 + apexLean} ${apexY + 2}, ${cx + apexLean} ${apexY}
          C ${cx + hw - 2 + apexLean} ${apexY + 2}, ${cx + capHalfWidth + 2} ${headTop + 4}, ${cx + capHalfWidth} ${brimY} Z`}
        fill={wool} />
      {/* Knit texture — subtle horizontal ribbing following the dome */}
      {[1, 2, 3, 4, 5].map(i => (
        <path key={`rib-${i}`}
          d={`M ${cx - capHalfWidth + 2} ${brimY - i * 6} Q ${cx + apexLean * (i / 5)} ${brimY - 1 - i * 6} ${cx + capHalfWidth - 2} ${brimY - i * 6}`}
          stroke="rgba(0,0,0,0.16)" strokeWidth="0.4" fill="none" />
      ))}
      {/* Rolled brim — fattened band along the base */}
      <ellipse cx={cx} cy={brimY + 1} rx={capHalfWidth + 1} ry={2.8} fill={wool} />
      <ellipse cx={cx} cy={brimY + 2} rx={capHalfWidth} ry={1.6} fill="rgba(0,0,0,0.28)" />
    </g>
  );
}


// ── Clothing ─────────────────────────────────────────────

function renderClothing(
  config: PortraitConfig, rng: () => number,
  cx: number, chinY: number, skin: SkinPalette,
): React.ReactNode {
  const { culturalGroup, socialClass } = config;
  const paths: React.ReactNode[] = [];

  const workingColors = ['#5c5040', '#4a5560', '#504a3a', '#5c4a4a', '#404a40', '#6a5a44'];
  const merchantColors = ['#3a3028', '#2c3e50', '#4c2424', '#2c4a3b', '#5a4428'];
  const nobleColors = ['#1a1a2e', '#3a0e0e', '#0e2a4a', '#2a4a0e', '#3a0e3a'];

  let color1: string, color2: string;
  if (socialClass === 'Noble') { color1 = nobleColors[Math.floor(rng() * nobleColors.length)]; color2 = '#c8a840'; }
  else if (socialClass === 'Merchant') { color1 = merchantColors[Math.floor(rng() * merchantColors.length)]; color2 = '#2a241e'; }
  else { color1 = workingColors[Math.floor(rng() * workingColors.length)]; color2 = '#3a3228'; }

  if (config.isSailor) {
    const sc = ['#b0a48c', '#8a9aaa', '#2b3036', '#5c4d40', '#7a7268'];
    color1 = sc[Math.floor(rng() * sc.length)];
  }

  const torsoTop = chinY + 15;
  const torsoPath = `M ${cx - 60} 250 L ${cx - 40} ${torsoTop} C ${cx - 20} ${torsoTop - 6}, ${cx + 20} ${torsoTop - 6}, ${cx + 40} ${torsoTop} L ${cx + 60} 250 Z`;
  paths.push(<path key="torso" d={torsoPath} fill={color1} />);

  if (culturalGroup === 'NorthEuropean' || culturalGroup === 'SouthEuropean') {
    // High collar/neckline that sits right under the chin — visible in the head-crop view.
    // Period: 1612 — falling band collar replacing the older Elizabethan ruff.
    const collarTopY = chinY + 6;   // tucks just under the throat shadow
    const collarMidY = chinY + 16;
    if (socialClass === 'Noble') {
      // Falling band — flat white linen collar draped over the doublet.
      paths.push(<path key="band-shadow"
        d={`M ${cx - 30} ${collarTopY + 2} C ${cx - 22} ${collarMidY + 6}, ${cx + 22} ${collarMidY + 6}, ${cx + 30} ${collarTopY + 2}
            L ${cx + 36} ${collarMidY + 14} L ${cx - 36} ${collarMidY + 14} Z`}
        fill="rgba(0,0,0,0.25)" />);
      paths.push(<path key="band"
        d={`M ${cx - 28} ${collarTopY} C ${cx - 20} ${collarMidY + 4}, ${cx + 20} ${collarMidY + 4}, ${cx + 28} ${collarTopY}
            L ${cx + 34} ${collarMidY + 12} L ${cx - 34} ${collarMidY + 12} Z`}
        fill="#f2ece0" stroke="#c8bfa8" strokeWidth="0.6" />);
      // Lace edging hint
      paths.push(<path key="band-edge"
        d={`M ${cx - 34} ${collarMidY + 12} L ${cx + 34} ${collarMidY + 12}`}
        stroke="#a89870" strokeWidth="0.5" strokeDasharray="2,1" fill="none" />);
      // Doublet underneath
      const doubletPath = `M ${cx - 60} 250 L ${cx - 36} ${collarMidY + 12} L ${cx + 36} ${collarMidY + 12} L ${cx + 60} 250 Z`;
      paths.push(<path key="doublet" d={doubletPath} fill={color1} />);
      // Gold trim/buttons down the front
      paths.push(<path key="doublet-trim" d={`M ${cx} ${collarMidY + 14} L ${cx} 250`} stroke={color2} strokeWidth="2" opacity={0.9} />);
      for (let i = 0; i < 4; i++) {
        const by = collarMidY + 22 + i * 14;
        if (by < 248) paths.push(<circle key={`btn-${i}`} cx={cx} cy={by} r={1.6} fill={color2} />);
      }
    } else if (socialClass === 'Merchant') {
      // Plain falling band — linen collar without the lace
      paths.push(<path key="band"
        d={`M ${cx - 24} ${collarTopY} C ${cx - 16} ${collarMidY + 2}, ${cx + 16} ${collarMidY + 2}, ${cx + 24} ${collarTopY}
            L ${cx + 28} ${collarMidY + 9} L ${cx - 28} ${collarMidY + 9} Z`}
        fill="#ece5d2" stroke="#bdb29a" strokeWidth="0.6" />);
      // Doublet underneath
      paths.push(<path key="doublet" d={`M ${cx - 60} 250 L ${cx - 30} ${collarMidY + 9} L ${cx + 30} ${collarMidY + 9} L ${cx + 60} 250 Z`} fill={color1} />);
      paths.push(<path key="lace" d={`M ${cx} ${collarMidY + 11} L ${cx} 250`} stroke={color2} strokeWidth="1.2" opacity={0.7} />);
    } else {
      // Working sailor — plain shirt with open neckline; no fancy collar
      // Tunic body
      paths.push(<path key="shirt"
        d={`M ${cx - 60} 250 L ${cx - 28} ${collarTopY + 4} C ${cx - 14} ${collarTopY - 2}, ${cx + 14} ${collarTopY - 2}, ${cx + 28} ${collarTopY + 4} L ${cx + 60} 250 Z`}
        fill={color1} />);
      // Shirt opening / placket
      paths.push(<path key="shirt-v"
        d={`M ${cx - 8} ${collarTopY + 2} L ${cx} ${collarTopY + 14} L ${cx + 8} ${collarTopY + 2}`}
        fill={skin.mid} stroke="rgba(0,0,0,0.18)" strokeWidth="0.6" />);
      // Shirt neckband
      paths.push(<path key="shirt-band"
        d={`M ${cx - 28} ${collarTopY + 4} C ${cx - 14} ${collarTopY - 2}, ${cx + 14} ${collarTopY - 2}, ${cx + 28} ${collarTopY + 4}`}
        stroke="rgba(0,0,0,0.25)" strokeWidth="0.7" fill="none" />);
    }
  } else if (culturalGroup === 'ArabPersian' || culturalGroup === 'Indian') {
    if (socialClass === 'Noble') {
      paths.push(<path key="jama-v" d={`M ${cx - 8} ${torsoTop - 3} L ${cx + 18} ${torsoTop + 20} L ${cx + 20} 250 L ${cx - 20} 250 L ${cx - 8} ${torsoTop - 3} Z`}
        fill={color2} opacity={0.6} />);
      paths.push(<path key="jama-trim" d={`M ${cx - 8} ${torsoTop - 3} L ${cx + 18} ${torsoTop + 20}`}
        stroke="#ffd700" strokeWidth="1.5" fill="none" />);
    } else {
      paths.push(<path key="kurta-v" d={`M ${cx - 6} ${torsoTop - 2} L ${cx} ${torsoTop + 12} L ${cx + 6} ${torsoTop - 2}`}
        fill={skin.mid} stroke="rgba(0,0,0,0.15)" strokeWidth="0.5" />);
    }
  } else if (culturalGroup === 'EastAsian') {
    paths.push(<path key="hf-l" d={`M ${cx - 8} ${torsoTop - 2} L ${cx + 12} ${torsoTop + 18}`} stroke={color2} strokeWidth="3" fill="none" />);
    paths.push(<path key="hf-r" d={`M ${cx + 8} ${torsoTop - 2} L ${cx - 4} ${torsoTop + 14}`} stroke={color2} strokeWidth="3" fill="none" />);
  } else if (culturalGroup === 'Swahili') {
    if (socialClass !== 'Working') {
      paths.push(<path key="kanzu-trim" d={`M ${cx - 15} ${torsoTop - 1} C ${cx} ${torsoTop + 4}, ${cx} ${torsoTop + 4}, ${cx + 15} ${torsoTop - 1}`}
        stroke="#c8a840" strokeWidth="1.5" fill="none" />);
    }
  } else if (culturalGroup === 'SoutheastAsian') {
    paths.push(<path key="baju-v" d={`M ${cx - 8} ${torsoTop - 2} L ${cx} ${torsoTop + 8} L ${cx + 8} ${torsoTop - 2}`}
      fill={socialClass === 'Noble' ? color2 : skin.mid} stroke="rgba(0,0,0,0.1)" strokeWidth="0.5" />);
  }

  return <g key="clothing">{paths}</g>;
}

// ── Clay pipe ────────────────────────────────────────────

function renderPipe(
  rng: () => number, cx: number, mouthY: number,
): React.ReactNode {
  const flip = rng() > 0.5 ? 1 : -1;
  const px = cx + flip * 8;
  const py = mouthY + 1;
  const ex = cx + flip * 42;
  const ey = mouthY + 10;

  return (
    <g key="pipe">
      {/* Pipe stem */}
      <path d={`M ${px} ${py} L ${ex} ${ey}`}
        stroke="#ddd4c4" strokeWidth="2.5" strokeLinecap="round" />
      {/* Pipe bowl */}
      <path d={`M ${ex} ${ey} L ${ex - flip * 3} ${ey - 6} L ${ex + flip * 3} ${ey - 5} L ${ex + flip * 5} ${ey + 1} Z`}
        fill="#c8bea8" />
      {/* Ember glow */}
      <circle cx={ex + flip * 1} cy={ey - 5} r={2} fill="#e04400" opacity={0.7} />
      {/* Smoke wisps */}
      <path d={`M ${ex} ${ey - 4} Q ${ex - flip * 4} ${ey - 14} ${ex + flip * 2} ${ey - 22}`}
        stroke="rgba(200,200,200,0.25)" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d={`M ${ex + flip * 2} ${ey - 6} Q ${ex + flip * 6} ${ey - 16} ${ex - flip * 1} ${ey - 26}`}
        stroke="rgba(200,200,200,0.15)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </g>
  );
}

// ── Eye patch ────────────────────────────────────────────

function renderEyePatch(
  rng: () => number, cx: number, eyeY: number, eyeSpacing: number, headWidth: number,
): React.ReactNode {
  const side = rng() > 0.5 ? -1 : 1;
  const ex = cx + side * eyeSpacing;
  const earX = cx + side * (headWidth + 2);

  return (
    <g key="eyepatch">
      {/* Strap */}
      <path d={`M ${ex - side * 8} ${eyeY - 6} L ${earX} ${eyeY - 10}`}
        stroke="#2a2218" strokeWidth="1.8" />
      <path d={`M ${ex - side * 8} ${eyeY + 5} L ${earX} ${eyeY + 2}`}
        stroke="#2a2218" strokeWidth="1.8" />
      {/* Patch */}
      <ellipse cx={ex} cy={eyeY} rx={9} ry={7}
        fill="#1a1610" stroke="#2a2218" strokeWidth="1" />
    </g>
  );
}

// ── Facial mark (mole/birthmark) ─────────────────────────

function renderFacialMark(
  config: PortraitConfig, cx: number, eyeY: number, headWidth: number, chinY: number,
): React.ReactNode {
  const markX = cx + config.facialMarkSide * (8 + config.facialMarkY * 12);
  const range = chinY - eyeY;
  const markY = eyeY + config.facialMarkY * range;
  const r = 0.8 + (config.seed % 10) * 0.12;

  return (
    <circle key="facial-mark" cx={markX} cy={markY} r={r}
      fill="rgba(60,30,10,0.4)" />
  );
}

// ── Freckles / sun damage ────────────────────────────────

function renderFreckles(
  rng: () => number, cx: number, eyeY: number, headWidth: number, noseY: number,
): React.ReactNode {
  const dots: React.ReactNode[] = [];
  const count = 12 + Math.floor(rng() * 15);
  for (let i = 0; i < count; i++) {
    const fx = cx + (rng() - 0.5) * headWidth * 1.4;
    const fy = eyeY - 2 + rng() * (noseY - eyeY + 10);
    // Cluster around nose/cheeks
    const dist = Math.abs(fx - cx);
    if (dist < headWidth * 0.8) {
      dots.push(
        <circle key={`frk-${i}`} cx={fx} cy={fy} r={0.5 + rng() * 0.6}
          fill="rgba(140,90,50,0.25)" />
      );
    }
  }
  return <g key="freckles">{dots}</g>;
}

// ── Tattoo / cultural marking ────────────────────────────

function renderTattoo(
  config: PortraitConfig, rng: () => number,
  cx: number, eyeY: number, headWidth: number, mouthY: number, chinY: number,
): React.ReactNode {
  const color = config.culturalGroup === 'Swahili' ? 'rgba(0,0,0,0.15)' :
    config.culturalGroup === 'SoutheastAsian' ? 'rgba(20,40,80,0.2)' :
    config.nationality === 'Japanese' ? 'rgba(20,50,80,0.18)' :
    'rgba(20,60,40,0.15)';

  switch (config.tattooType) {
    case 'forehead': {
      // Horizontal lines or dots across forehead
      const y = eyeY - 28;
      return (
        <g key="tattoo">
          <path d={`M ${cx - 10} ${y} L ${cx + 10} ${y}`} stroke={color} strokeWidth="1.2" />
          <path d={`M ${cx - 7} ${y + 3} L ${cx + 7} ${y + 3}`} stroke={color} strokeWidth="0.8" />
        </g>
      );
    }
    case 'cheek': {
      // Scarification marks — short parallel lines
      const side = rng() > 0.5 ? 1 : -1;
      const bx = cx + side * (headWidth - 10);
      const by = eyeY + 14;
      return (
        <g key="tattoo">
          <path d={`M ${bx} ${by} l ${side * 6} 0`} stroke={color} strokeWidth="1" />
          <path d={`M ${bx} ${by + 3} l ${side * 6} 0`} stroke={color} strokeWidth="1" />
          <path d={`M ${bx} ${by + 6} l ${side * 6} 0`} stroke={color} strokeWidth="1" />
        </g>
      );
    }
    case 'chin': {
      // Chin tattoo — dot pattern or line
      return (
        <g key="tattoo">
          <path d={`M ${cx - 6} ${chinY - 6} L ${cx} ${chinY + 1} L ${cx + 6} ${chinY - 6}`}
            stroke={color} strokeWidth="1" fill="none" />
          <circle cx={cx} cy={chinY - 2} r={1} fill={color} />
        </g>
      );
    }
    case 'arm':
    default: {
      // Visible on neck/collarbone area
      const side = rng() > 0.5 ? 1 : -1;
      return (
        <g key="tattoo">
          <path d={`M ${cx + side * 12} ${chinY + 10} C ${cx + side * 16} ${chinY + 14}, ${cx + side * 14} ${chinY + 20}, ${cx + side * 10} ${chinY + 18}`}
            stroke={color} strokeWidth="1.2" fill="none" />
          <circle cx={cx + side * 13} cy={chinY + 15} r={2} fill="none" stroke={color} strokeWidth="0.8" />
        </g>
      );
    }
  }
}

// ── Neck kerchief ────────────────────────────────────────

function renderNeckKerchief(
  config: PortraitConfig, cx: number, chinY: number,
): React.ReactNode {
  const color = config.kerchiefColor;
  const ty = chinY + 12;
  return (
    <g key="kerchief">
      {/* Knot */}
      <path d={`M ${cx - 3} ${ty} L ${cx} ${ty + 6} L ${cx + 3} ${ty} Z`} fill={color} />
      {/* Band */}
      <path d={`M ${cx - 20} ${ty + 2} C ${cx - 10} ${ty - 2}, ${cx + 10} ${ty - 2}, ${cx + 20} ${ty + 2}`}
        stroke={color} strokeWidth="3.5" fill="none" strokeLinecap="round" />
      {/* Hanging ends */}
      <path d={`M ${cx - 1} ${ty + 5} L ${cx - 4} ${ty + 14}`} stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d={`M ${cx + 1} ${ty + 5} L ${cx + 3} ${ty + 13}`} stroke={color} strokeWidth="2" strokeLinecap="round" />
    </g>
  );
}

// ── Neck jewelry ─────────────────────────────────────────

function renderNeckJewelry(
  config: PortraitConfig, rng: () => number, cx: number, chinY: number,
): React.ReactNode {
  const ny = chinY + 16;

  switch (config.neckJewelryType) {
    case 'cross': {
      return (
        <g key="neck-jewelry">
          {/* Chain */}
          <path d={`M ${cx - 12} ${chinY + 6} Q ${cx} ${ny + 2} ${cx + 12} ${chinY + 6}`}
            stroke="#a89060" strokeWidth="0.8" fill="none" />
          {/* Cross */}
          <rect x={cx - 1.5} y={ny - 1} width={3} height={7} fill="#c8a840" rx={0.3} />
          <rect x={cx - 3.5} y={ny + 1} width={7} height={2.5} fill="#c8a840" rx={0.3} />
        </g>
      );
    }
    case 'beads': {
      const beads: React.ReactNode[] = [];
      const beadCount = 7 + Math.floor(rng() * 4);
      for (let i = 0; i < beadCount; i++) {
        const t = i / (beadCount - 1);
        const bx = cx - 14 + t * 28;
        const by = chinY + 6 + Math.sin(t * Math.PI) * 10;
        const beadColor = rng() > 0.5 ? '#c8a840' : rng() > 0.5 ? '#e04020' : '#2060a0';
        beads.push(<circle key={`bead-${i}`} cx={bx} cy={by} r={1.5} fill={beadColor} />);
      }
      return <g key="neck-jewelry">{beads}</g>;
    }
    case 'coins': {
      return (
        <g key="neck-jewelry">
          <path d={`M ${cx - 14} ${chinY + 5} Q ${cx} ${ny + 4} ${cx + 14} ${chinY + 5}`}
            stroke="#a89060" strokeWidth="0.6" fill="none" />
          {[-6, 0, 6].map(dx => (
            <g key={`coin-${dx}`}>
              <circle cx={cx + dx} cy={ny + 1 + Math.abs(dx) * 0.15} r={2.5}
                fill="#d4a020" stroke="#a88020" strokeWidth="0.4" />
              <circle cx={cx + dx} cy={ny + 1 + Math.abs(dx) * 0.15} r={1}
                fill="none" stroke="#a88020" strokeWidth="0.3" />
            </g>
          ))}
        </g>
      );
    }
    case 'pendant':
    default: {
      const gemColor = rng() > 0.5 ? '#2060a0' : rng() > 0.5 ? '#206020' : '#a02020';
      return (
        <g key="neck-jewelry">
          <path d={`M ${cx - 10} ${chinY + 6} Q ${cx} ${ny + 3} ${cx + 10} ${chinY + 6}`}
            stroke="#a89060" strokeWidth="0.8" fill="none" />
          <path d={`M ${cx - 3} ${ny} L ${cx} ${ny + 5} L ${cx + 3} ${ny} Z`}
            fill={gemColor} stroke="#c8a840" strokeWidth="0.5" />
        </g>
      );
    }
  }
}

// ── Personality → expression ─────────────────────────────

interface ExprCtrl {
  setMouthCurve: (v: number) => void;
  setMouthAsym: (v: number) => void;
  setBrowL: (i: number, o: number) => void;
  setBrowR: (i: number, o: number) => void;
}

function applyPersonality(p: Personality, rng: () => number, c: ExprCtrl) {
  switch (p) {
    case 'Friendly':   c.setMouthCurve(-2.5 - rng() * 2); c.setBrowL(-1, 1); c.setBrowR(-1, 1); break;
    case 'Stern':      c.setMouthCurve(1.5 + rng()); c.setBrowL(3, -2); c.setBrowR(3, -2); break;
    case 'Curious':    c.setMouthCurve(-0.5); c.setBrowL(-3, -1); c.setBrowR(0, 0); break;
    case 'Smug':       c.setMouthCurve(-1); c.setMouthAsym(2); c.setBrowL(-1, -1); c.setBrowR(-1, -1); break;
    case 'Melancholy': c.setMouthCurve(2); c.setBrowL(-2, 2); c.setBrowR(-2, 2); break;
    case 'Weathered':  c.setMouthCurve(0.5); c.setBrowL(1, 0); c.setBrowR(1, 0); break;
    case 'Fierce':     c.setMouthCurve(1); c.setMouthAsym(rng() * 1.5); c.setBrowL(4, -3); c.setBrowR(4, -3); break;
    case 'Rage':       c.setMouthCurve(0.2); c.setMouthAsym((rng() - 0.5) * 1.2); c.setBrowL(7, -5); c.setBrowR(7, -5); break;
    default: break;
  }
}

// ── Role background ──────────────────────────────────────

function getRoleBgColor(config: PortraitConfig): string {
  switch (config.role) {
    case 'Captain':   return '#2a2818';
    case 'Navigator': return '#182028';
    case 'Gunner':    return '#281818';
    case 'Factor':    return '#182818';
    case 'Surgeon':   return '#201820';
    default:          return '#1a1e22';
  }
}

// ── Cultural accent — subtle origin-region tint for the background ──

function getCulturalAccent(group: PortraitConfig['culturalGroup']): { color: string; opacity: number } {
  switch (group) {
    case 'ArabPersian':    return { color: '#c89040', opacity: 0.18 };  // warm amber
    case 'Indian':         return { color: '#d4882c', opacity: 0.16 };  // deep saffron
    case 'Swahili':        return { color: '#a0603a', opacity: 0.18 };  // warm sienna
    case 'NorthEuropean':  return { color: '#6888a8', opacity: 0.14 };  // cool steel-blue
    case 'SouthEuropean':  return { color: '#887050', opacity: 0.15 };  // warm umber
    case 'EastAsian':      return { color: '#508868', opacity: 0.14 };  // muted jade
    case 'SoutheastAsian': return { color: '#5a9080', opacity: 0.15 };  // teal-green
    default:               return { color: '#808080', opacity: 0.10 };
  }
}

// ── Captain flag backgrounds — period-appropriate c.1612 flag designs ──

function renderCaptainFlag(nationality: PortraitConfig['nationality'], uid: string): React.ReactNode {
  const w = 200, h = 250;
  switch (nationality) {
    // Portuguese: blue and white with central shield (Quinas)
    case 'Portuguese':
      return (<g key="flag">
        <rect width={w} height={h} fill="#003399" />
        <rect x={0} y={0} width={w * 0.4} height={h} fill="#006600" />
        <circle cx={w * 0.4} cy={h * 0.42} r={28} fill="#ff0" />
        <circle cx={w * 0.4} cy={h * 0.42} r={20} fill="#003399" />
        {/* Five quinas (simplified) */}
        {[-8, 8, 0, -6, 6].map((dx, i) => (
          <circle key={i} cx={w * 0.4 + dx} cy={h * 0.42 + (i < 2 ? -6 : i === 2 ? 0 : 6)} r={3} fill="#fff" />
        ))}
      </g>);

    // Dutch: Prince's Flag (orange-white-blue, pre-1648)
    case 'Dutch':
      return (<g key="flag">
        <rect width={w} height={h / 3} fill="#c84b20" />
        <rect y={h / 3} width={w} height={h / 3} fill="#fff" />
        <rect y={h * 2 / 3} width={w} height={h / 3} fill="#1e3a7a" />
      </g>);

    // English: St George's Cross
    case 'English':
      return (<g key="flag">
        <rect width={w} height={h} fill="#fff" />
        <rect x={w * 0.44} y={0} width={w * 0.12} height={h} fill="#c8102e" />
        <rect x={0} y={h * 0.44} width={w} height={h * 0.12} fill="#c8102e" />
      </g>);

    // Danish: Dannebrog
    case 'Danish':
      return (<g key="flag">
        <rect width={w} height={h} fill="#c8102e" />
        <rect x={w * 0.3} y={0} width={w * 0.1} height={h} fill="#fff" />
        <rect x={0} y={h * 0.44} width={w} height={h * 0.1} fill="#fff" />
      </g>);

    // French: Royal blue with gold fleur-de-lis
    case 'French':
      return (<g key="flag">
        <rect width={w} height={h} fill="#1a2a6c" />
        {/* Three fleur-de-lis arrangement */}
        {[[100, 80], [70, 140], [130, 140]].map(([fx, fy], i) => (
          <g key={i} transform={`translate(${fx},${fy}) scale(0.7)`}>
            <path d="M0,-12 C-4,-8 -6,-2 -8,4 C-4,2 -1,0 0,4 C1,0 4,2 8,4 C6,-2 4,-8 0,-12Z" fill="#d4a017" />
            <circle cx={0} cy={6} r={2} fill="#d4a017" />
          </g>
        ))}
      </g>);

    // Spanish: Cross of Burgundy (Aspas de Borgoña) — red ragged cross on white
    case 'Spanish':
      return (<g key="flag">
        <rect width={w} height={h} fill="#f5e6c8" />
        <path d={`M 20,10 L ${w - 20},${h - 10} M ${w - 20},10 L 20,${h - 10}`}
          stroke="#8b1a1a" strokeWidth={18} fill="none" strokeLinecap="round"
          strokeDasharray="4,0" />
        {/* Ragged edges on the cross — small bumps */}
        <path d={`M 20,10 L ${w - 20},${h - 10}`}
          stroke="#721515" strokeWidth={6} fill="none" strokeDasharray="3,5" />
        <path d={`M ${w - 20},10 L 20,${h - 10}`}
          stroke="#721515" strokeWidth={6} fill="none" strokeDasharray="3,5" />
      </g>);

    // Ottoman: red with white crescent and star
    case 'Ottoman':
      return (<g key="flag">
        <rect width={w} height={h} fill="#c8102e" />
        <circle cx={95} cy={h * 0.42} r={22} fill="#fff" />
        <circle cx={103} cy={h * 0.42} r={18} fill="#c8102e" />
        <polygon points="128,95 132,107 124,107" fill="#fff" />
      </g>);

    // Persian: lion and sun on white (Safavid era)
    case 'Persian':
      return (<g key="flag">
        <rect width={w} height={h} fill="#1a5e1a" />
        <rect x={20} y={30} width={w - 40} height={h - 60} fill="#f5f0e0" rx={4} />
        <circle cx={100} cy={h * 0.42} r={18} fill="#d4a017" />
        {/* Sun rays */}
        {Array.from({ length: 12 }).map((_, i) => {
          const angle = (i * 30) * Math.PI / 180;
          return <line key={i} x1={100 + Math.cos(angle) * 18} y1={h * 0.42 + Math.sin(angle) * 18}
            x2={100 + Math.cos(angle) * 26} y2={h * 0.42 + Math.sin(angle) * 26}
            stroke="#d4a017" strokeWidth={2} />;
        })}
      </g>);

    // Omani: red (Ya'arubi dynasty)
    case 'Omani':
      return (<g key="flag">
        <rect width={w} height={h} fill="#c8102e" />
        <rect x={0} y={0} width={w * 0.25} height={h} fill="#fff" />
        {/* Khanjar (dagger) silhouette */}
        <path d={`M ${w * 0.5} ${h * 0.3} L ${w * 0.5} ${h * 0.55} M ${w * 0.44} ${h * 0.32} C ${w * 0.47} ${h * 0.28} ${w * 0.53} ${h * 0.28} ${w * 0.56} ${h * 0.32}`}
          stroke="#fff" strokeWidth={3} fill="none" strokeLinecap="round" />
      </g>);

    // Mughal: green with gold ornamentation
    case 'Mughal':
      return (<g key="flag">
        <rect width={w} height={h} fill="#1a5e1a" />
        {/* Central medallion */}
        <circle cx={100} cy={h * 0.42} r={30} fill="none" stroke="#d4a017" strokeWidth={2} />
        <circle cx={100} cy={h * 0.42} r={22} fill="none" stroke="#d4a017" strokeWidth={1.5} />
        <circle cx={100} cy={h * 0.42} r={6} fill="#d4a017" />
        {/* Corner ornaments */}
        {[[30, 40], [170, 40], [30, 210], [170, 210]].map(([ox, oy], i) => (
          <circle key={i} cx={ox} cy={oy} r={8} fill="none" stroke="#d4a017" strokeWidth={1} />
        ))}
      </g>);

    // Gujarati: saffron/maroon trade banner
    case 'Gujarati':
      return (<g key="flag">
        <rect width={w} height={h} fill="#8b4513" />
        <rect x={15} y={20} width={w - 30} height={h - 40} fill="none" stroke="#d4a017" strokeWidth={2} rx={3} />
        <circle cx={100} cy={h * 0.42} r={20} fill="#d4a017" opacity={0.6} />
        <path d="M 90,95 L 100,80 L 110,95 L 105,95 L 105,115 L 95,115 L 95,95 Z" fill="#d4a017" opacity={0.8} />
      </g>);

    // Swahili: coastal trade banner — blue/white/gold
    case 'Swahili':
      return (<g key="flag">
        <rect width={w} height={h} fill="#1a3a5a" />
        <rect y={h * 0.3} width={w} height={h * 0.4} fill="#2a5a3a" />
        {/* Dhow sail silhouette */}
        <path d={`M 100,${h * 0.3} L 120,${h * 0.6} L 80,${h * 0.6} Z`} fill="#d4a017" opacity={0.5} />
        <line x1={100} y1={h * 0.28} x2={100} y2={h * 0.62} stroke="#d4a017" strokeWidth={2} />
      </g>);

    // Malay: red and gold
    case 'Malay':
      return (<g key="flag">
        <rect width={w} height={h} fill="#8b0000" />
        <rect y={h * 0.45} width={w} height={h * 0.1} fill="#d4a017" />
        <circle cx={100} cy={h * 0.25} r={16} fill="#d4a017" />
        <circle cx={106} cy={h * 0.25} r={13} fill="#8b0000" />
      </g>);

    // Acehnese: green with gold crescent (Sultanate of Aceh)
    case 'Acehnese':
      return (<g key="flag">
        <rect width={w} height={h} fill="#1a5e1a" />
        <circle cx={95} cy={h * 0.42} r={20} fill="#d4a017" />
        <circle cx={102} cy={h * 0.42} r={16} fill="#1a5e1a" />
        <polygon points="125,100 128,110 122,110" fill="#d4a017" />
      </g>);

    // Javanese: deep red/brown batik-inspired
    case 'Javanese':
      return (<g key="flag">
        <rect width={w} height={h} fill="#5a1a0a" />
        {/* Diamond pattern (batik kawung inspired) */}
        {[0, 1, 2, 3, 4].map(row =>
          [0, 1, 2, 3].map(col => (
            <circle key={`${row}-${col}`} cx={30 + col * 45} cy={30 + row * 50}
              r={12} fill="none" stroke="#d4a017" strokeWidth={1} opacity={0.5} />
          ))
        )}
      </g>);

    // Moluccan: spice islands — blue sea with gold
    case 'Moluccan':
      return (<g key="flag">
        <rect width={w} height={h} fill="#1a3a6a" />
        <rect y={h * 0.6} width={w} height={h * 0.4} fill="#2a6a3a" />
        {/* Clove/nutmeg star */}
        <polygon points="100,70 106,90 126,90 110,102 116,122 100,110 84,122 90,102 74,90 94,90"
          fill="#d4a017" opacity={0.7} />
      </g>);

    // Siamese: red with white elephant (Ayutthaya)
    case 'Siamese':
      return (<g key="flag">
        <rect width={w} height={h} fill="#8b0000" />
        {/* Simplified elephant silhouette */}
        <ellipse cx={100} cy={h * 0.42} rx={22} ry={18} fill="#fff" opacity={0.8} />
        <ellipse cx={82} cy={h * 0.38} rx={8} ry={10} fill="#fff" opacity={0.8} />
        <path d="M 78,98 Q 75,115 80,120" stroke="#fff" strokeWidth={3} fill="none" strokeLinecap="round" opacity={0.8} />
      </g>);

    // Chinese: Ming dynasty — yellow/dragon red
    case 'Chinese':
      return (<g key="flag">
        <rect width={w} height={h} fill="#d4a017" />
        <rect x={10} y={10} width={w - 20} height={h - 20} fill="none" stroke="#8b0000" strokeWidth={4} />
        {/* Simplified dragon circle */}
        <circle cx={100} cy={h * 0.42} r={28} fill="none" stroke="#8b0000" strokeWidth={3} />
        <circle cx={100} cy={h * 0.42} r={18} fill="none" stroke="#8b0000" strokeWidth={2} />
        <circle cx={100} cy={h * 0.42} r={5} fill="#8b0000" />
      </g>);

    // Japanese: Hinomaru-style (Tokugawa era)
    case 'Japanese':
      return (<g key="flag">
        <rect width={w} height={h} fill="#f5f0e0" />
        <circle cx={100} cy={h * 0.42} r={35} fill="#bc002d" />
      </g>);

    default:
      return (<g key="flag"><rect width={w} height={h} fill="#1a1e22" /></g>);
  }
}

export default CrewPortrait;
