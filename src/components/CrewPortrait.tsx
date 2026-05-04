/**
 * CrewPortrait — Procedural SVG portrait generator for crew members.
 *
 * Generates deterministic, characterful portraits from CrewMember data.
 * Every face is unique but consistent: the same crew member always looks the same.
 *
 * Supports all 19 nationalities with culturally appropriate clothing, headwear,
 * facial hair, and accessories for the c. 1612 Indian Ocean setting.
 */

import React, { useId, useMemo } from 'react';
import type { CrewMember, HealthFlag } from '../store/gameStore';
import {
  renderEyePatch,
  renderFacialMark,
  renderFreckles,
  renderNeckJewelry,
  renderNeckKerchief,
  renderPipe,
  renderTattoo,
} from './portrait/accessories';
import { getCulturalAccent, getRoleBgColor, renderCaptainFlag } from './portrait/backgrounds';
import { renderClothing } from './portrait/clothing';
import { renderEyeWithLid } from './portrait/eyes';
import {
  renderBackHair,
  renderEarring,
  renderFacialHair,
  renderFrontHair,
  renderHeadwear,
  renderScar,
} from './portrait/hair';
import { applyPersonality } from './portrait/expression';
import { headPath, renderEars, renderNose, renderWrinkles } from './portrait/face';
import {
  mulberry32,
  crewToPortraitConfig,
  tavernNpcToPortraitConfig,
  getSkin,
  getEyeColor,
  getHairColor,
  portraitConfigSignature,
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
  const instanceId = useSvgInstanceId('crew-portrait');
  const portrait = useMemo(() => {
    const config = crewToPortraitConfig(member);
    const displayConfig = expressionOverride ? { ...config, personality: expressionOverride } : config;
    return renderPortrait(displayConfig, showBackground, member.morale, member.health, instanceId);
  }, [member, showBackground, expressionOverride, instanceId]);

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
  const instanceId = useSvgInstanceId('crew-portrait-square');
  const portrait = useMemo(() => {
    const config = crewToPortraitConfig(member);
    const displayConfig = expressionOverride ? { ...config, personality: expressionOverride } : config;
    const showBg = config.role === 'Captain'; // captains get flag background even in compact view
    return renderPortrait(displayConfig, showBg, member.morale, member.health, instanceId);
  }, [member, expressionOverride, instanceId]);

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
  const instanceId = useSvgInstanceId('config-portrait');
  const configKey = portraitConfigSignature(config);
  const portrait = useMemo(() => renderPortrait(config, showBackground, undefined, undefined, instanceId), [config, configKey, showBackground, instanceId]);

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

function useSvgInstanceId(prefix: string): string {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

export function renderPortraitForTest(config: PortraitConfig, instanceId = 'test-portrait', showBg = false): React.ReactNode {
  return renderPortrait(config, showBg, undefined, undefined, instanceId);
}

function renderPortrait(config: PortraitConfig, showBg: boolean, morale?: number, health?: HealthFlag, instanceId?: string): React.ReactNode {
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

  // ── Eyes (large enough to read clearly in small portraits) ──
  const eyeSpacing = 17 + rng() * 5;                 // 17–22, allows wide-set and close-set
  const eyeY = 100 + (rng() - 0.5) * 3;
  const eyeHeight = 6 + rng() * 8;                   // 6–14, substantially bigger
  const eyeWidth = 18 + rng() * 10;                  // 18–28, wider range
  const eyeSlant = (rng() - 0.5) * 5;                // -2.5 to +2.5
  const eyeLidWeight = 0.1 + rng() * 0.5;             // 0.1–0.6, less lid coverage to show more eye
  const isEastAsian = config.culturalGroup === 'EastAsian';
  const isSEAsian = config.culturalGroup === 'SoutheastAsian';
  // Eye shape type — controls how round vs almond vs droopy the eye is
  const eyeShapeRoll = rng();
  const eyeShape: 'round' | 'almond' | 'droopy' | 'wide' | 'hooded' =
    isEastAsian
      ? eyeShapeRoll < 0.08 ? 'round' :
        eyeShapeRoll < 0.48 ? 'almond' :
        eyeShapeRoll < 0.62 ? 'wide' :
        eyeShapeRoll < 0.88 ? 'hooded' : 'droopy'
      : eyeShapeRoll < 0.2 ? 'round' :
        eyeShapeRoll < 0.45 ? 'almond' :
        eyeShapeRoll < 0.68 ? 'wide' :
        eyeShapeRoll < 0.8 ? 'hooded' : 'droopy';
  const gazeOffsetX = (rng() - 0.5) * 2.5;           // iris shift left/right — makes eyes feel alive
  const gazeOffsetY = rng() * 1.5;                    // iris shift slightly down (never up — looks unnatural)

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
  const uid = `${instanceId ?? 'portrait'}-p${Math.abs(config.seed)}`.replace(/[^a-zA-Z0-9_-]/g, '');

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
        const base = 0.045 + ageIdx * 0.018 + (config.skinIndex === 14 ? 0.06 : 0)
          + (config.skinIndex === 11 ? 0.035 : 0);
        const darkSkin = config.skinIndex >= 6 && config.skinIndex !== 11 && config.skinIndex !== 14;
        const intensity = darkSkin ? base * 0.35 : base;
        if (intensity < 0.03) return null;
        return (
          <g key="sun-wash">
            {/* Nose bridge and tip — where the sun hits hardest */}
            <ellipse cx={cx} cy={eyeY + noseLength * 0.55} rx={effNoseWidth - 1}
              ry={noseLength * 0.32} fill="rgb(176,82,64)" opacity={intensity} />
            <ellipse cx={cx} cy={noseY - 1} rx={effNoseWidth + 1} ry={4}
              fill="rgb(188,90,72)" opacity={intensity * 0.95} />
            {/* Cheek apples — zygomatic flush on both sides */}
            <ellipse cx={cx - headWidth + 12} cy={eyeY + 13}
              rx={7} ry={4.5} fill="rgb(176,82,64)" opacity={intensity * 0.55}
              transform={`rotate(-12 ${cx - headWidth + 12} ${eyeY + 13})`} />
            <ellipse cx={cx + headWidth - 12} cy={eyeY + 13}
              rx={7} ry={4.5} fill="rgb(176,82,64)" opacity={intensity * 0.55}
              transform={`rotate(12 ${cx + headWidth - 12} ${eyeY + 13})`} />
            {/* Forehead cap — where a hat brim stops, the exposed strip catches sun too */}
            {ageIdx >= 2 && (
              <ellipse cx={cx} cy={eyeY - foreheadHeight * 0.35}
                rx={headWidth * 0.55} ry={5}
                fill="rgb(176,82,64)" opacity={intensity * 0.28} />
            )}
          </g>
        );
      })()}

      {/* Nose */}
      {renderNose(cx, eyeY, noseY, noseLength, effNoseWidth, noseBridge, noseTip, noseCurve, philtrumDepth, mouthY, config.hasBrokenNose, skin)}

      {/* Directional eye socket shadows — narrow contours, not broad bruised patches */}
      <path d={`M ${cx - eyeSpacing - eyeWidth * 0.62} ${eyeY + 1}
          Q ${cx - eyeSpacing} ${eyeY + eyeHeight * 0.58}, ${cx - eyeSpacing + eyeWidth * 0.62} ${eyeY + 1}`}
        stroke={`rgba(0,0,0,${lightSide < 0 ? 0.09 * lightIntensity : 0.035})`} strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d={`M ${cx + eyeSpacing - eyeWidth * 0.62} ${eyeY + 1}
          Q ${cx + eyeSpacing} ${eyeY + eyeHeight * 0.58}, ${cx + eyeSpacing + eyeWidth * 0.62} ${eyeY + 1}`}
        stroke={`rgba(0,0,0,${lightSide > 0 ? 0.035 : 0.09 * lightIntensity})`} strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d={`M ${cx - eyeSpacing - eyeWidth * 0.7} ${eyeY - eyeHeight - 2}
          Q ${cx - eyeSpacing} ${eyeY - eyeHeight - 6}, ${cx - eyeSpacing + eyeWidth * 0.72} ${eyeY - eyeHeight - 1}`}
        stroke={`rgba(0,0,0,${0.055 * lightIntensity})`} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d={`M ${cx + eyeSpacing - eyeWidth * 0.72} ${eyeY - eyeHeight - 1}
          Q ${cx + eyeSpacing} ${eyeY - eyeHeight - 6}, ${cx + eyeSpacing + eyeWidth * 0.7} ${eyeY - eyeHeight - 2}`}
        stroke={`rgba(0,0,0,${0.055 * lightIntensity})`} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d={`M ${cx - eyeSpacing - eyeWidth * 0.56} ${eyeY + eyeHeight * 0.74}
          Q ${cx - eyeSpacing} ${eyeY + eyeHeight * 1.05}, ${cx - eyeSpacing + eyeWidth * 0.56} ${eyeY + eyeHeight * 0.76}`}
        stroke="rgba(0,0,0,0.04)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d={`M ${cx + eyeSpacing - eyeWidth * 0.56} ${eyeY + eyeHeight * 0.76}
          Q ${cx + eyeSpacing} ${eyeY + eyeHeight * 1.05}, ${cx + eyeSpacing + eyeWidth * 0.56} ${eyeY + eyeHeight * 0.74}`}
        stroke="rgba(0,0,0,0.04)" strokeWidth="1.5" fill="none" strokeLinecap="round" />

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

export default CrewPortrait;
