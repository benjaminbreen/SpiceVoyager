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
import type { CrewMember } from '../store/gameStore';
import {
  mulberry32,
  crewToPortraitConfig,
  getSkin,
  getEyeColor,
  getHairColor,
  type PortraitConfig,
  type SkinPalette,
  type Personality,
} from '../utils/portraitConfig';

// Re-export for modal use
export { crewToPortraitConfig, getSkin, getEyeColor, getHairColor } from '../utils/portraitConfig';
export type { PortraitConfig } from '../utils/portraitConfig';

// ── Public component ─────────────────────────────────────

interface CrewPortraitProps {
  member: CrewMember;
  size?: number;
  className?: string;
  showBackground?: boolean;
}

export function CrewPortrait({ member, size = 64, className = '', showBackground = true }: CrewPortraitProps) {
  const portrait = useMemo(() => {
    const config = crewToPortraitConfig(member);
    return renderPortrait(config, showBackground, member.morale);
  }, [member.id, member.name, member.role, member.quality, member.morale, showBackground]);

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
export function CrewPortraitSquare({ member, size = 32, className = '' }: Omit<CrewPortraitProps, 'showBackground'>) {
  const portrait = useMemo(() => {
    const config = crewToPortraitConfig(member);
    return renderPortrait(config, false, member.morale);
  }, [member.id, member.name, member.role, member.quality, member.morale]);

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

// ── Core renderer ────────────────────────────────────────

function renderPortrait(config: PortraitConfig, showBg: boolean, morale?: number): React.ReactNode {
  const rng = mulberry32(config.seed);
  const skin = getSkin(config);
  const eyeColor = getEyeColor(config);
  const hairColor = getHairColor(config);

  // ── Head proportions ──
  const headWidth = 38 + (rng() - 0.5) * 10;
  const jawWidth = headWidth - 3 - rng() * 8;
  const jawLength = 58 + (rng() - 0.5) * 10;
  const foreheadHeight = 8 + rng() * 5;
  const cheekWidth = headWidth + rng() * 4;

  // ── Eyes ──
  const eyeSpacing = 16 + rng() * 6;                 // 16–22, allows wide-set and close-set
  const eyeY = 100 + (rng() - 0.5) * 3;
  const eyeHeight = 3.5 + rng() * 5;                 // 3.5–8.5, narrow slits to open eyes
  const eyeWidth = 14 + rng() * 6;                   // 14–20, always wider than tall
  const eyeSlant = (rng() - 0.5) * 5;                // -2.5 to +2.5
  const eyeLidWeight = 0.15 + rng() * 0.6;            // 0.15–0.75, always some lid visible
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

  // ── Mouth ──
  const mouthWidth = 12 + rng() * 10;                // 12–22, tight to wide
  const mouthY = eyeY + noseLength + 16 + (rng() - 0.5) * 3;
  const upperLip = 2 + rng() * 4;                    // 2–6
  const lowerLip = 2.5 + rng() * 6;                  // 2.5–8.5

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

  // ── Expression ──
  let mouthCurve = (rng() - 0.5) * 2;
  let mouthAsym = (rng() - 0.5) * 1;
  let browInnerL = 0, browOuterL = 0, browInnerR = 0, browOuterR = 0;

  applyPersonality(config.personality, rng, {
    setMouthCurve: (v: number) => { mouthCurve = v; },
    setMouthAsym: (v: number) => { mouthAsym = v; },
    setBrowL: (i: number, o: number) => { browInnerL = i; browOuterL = o; },
    setBrowR: (i: number, o: number) => { browInnerR = i; browOuterR = o; },
  });

  // Morale-based expression nudges — only at extremes, blends with base personality
  if (morale !== undefined) {
    if (morale < 20) {
      // Miserable: angry frown, furrowed brows
      mouthCurve = Math.max(mouthCurve, 2.5);
      browInnerL += 3; browInnerR += 3;
      browOuterL -= 2; browOuterR -= 2;
    } else if (morale < 40) {
      // Unhappy: slight downturn, tenser brows
      mouthCurve += 1.2;
      browInnerL += 1.5; browInnerR += 1.5;
    } else if (morale > 85) {
      // Elated: broad smile, relaxed lifted brows
      mouthCurve = Math.min(mouthCurve, -3);
      browInnerL -= 2; browInnerR -= 2;
      browOuterL += 1.5; browOuterR += 1.5;
    } else if (morale > 70) {
      // Content: gentle upturn, slightly relaxed brows
      mouthCurve -= 1.2;
      browInnerL -= 1; browInnerR -= 1;
    }
  }

  // ── Age ──
  const ageIdx = ['20s', '30s', '40s', '50s', '60s'].indexOf(config.age);
  const wrinkleAlpha = Math.max(0, (ageIdx - 1) * 0.15);
  const jowlSag = ageIdx >= 3 ? (ageIdx - 2) * 1.5 : 0;
  const underEyeBags = ageIdx >= 2 ? (ageIdx - 1) * 0.08 : 0;

  // ── Skin texture ──
  // Outdoor/older crew get coarser, more visible skin texture
  const isOutdoorRole = config.role === 'Sailor' || config.role === 'Gunner' || config.role === 'Captain';
  const skinRoughness = 0.02 + ageIdx * 0.008 + (isOutdoorRole ? 0.008 : 0) + rng() * 0.01;
  const skinTextureOpacity = 0.06 + ageIdx * 0.03 + (isOutdoorRole ? 0.025 : 0);
  const skinTextureSeed = Math.floor(rng() * 9999);  // unique noise per portrait

  // ── Layout constants ──
  const cx = 100;
  const headTop = eyeY - 44 - foreheadHeight;
  const chinY = eyeY + jawLength;
  const noseY = eyeY + noseLength;
  const bgColor = getRoleBgColor(config);
  const culturalAccent = getCulturalAccent(config.culturalGroup);
  const uid = `p${Math.abs(config.seed)}`;

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
      </defs>

      {/* Background with vignette + cultural accent */}
      {showBg && (
        <g key="bg">
          <rect width="200" height="250" fill={`url(#bg-${uid})`} />
          <rect width="200" height="250" fill={`url(#culture-${uid})`} />
          <rect width="200" height="250" fill={`url(#vign-${uid})`} />
        </g>
      )}

      {/* Back hair */}
      {renderBackHair(config, rng, cx, headTop, headWidth, hairColor)}

      {/* Clothing */}
      {renderClothing(config, rng, cx, chinY, skin)}

      {/* Neck */}
      <path d={`M ${cx - 15} ${chinY - 8} L ${cx - 17} ${chinY + 25} L ${cx + 17} ${chinY + 25} L ${cx + 15} ${chinY - 8} Z`}
        fill={`url(#skin-${uid})`} />
      <path d={`M ${cx - 15} ${chinY - 8} L ${cx - 17} ${chinY + 25} L ${cx + 17} ${chinY + 25} L ${cx + 15} ${chinY - 8} Z`}
        fill={`url(#shadow-${uid})`} />
      <path d={`M ${cx - 15} ${chinY - 8} L ${cx - 17} ${chinY + 25} L ${cx + 17} ${chinY + 25} L ${cx + 15} ${chinY - 8} Z`}
        fill={skin.mid} opacity={skinTextureOpacity * 0.7} filter={`url(#skinTex-${uid})`} />

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

      {/* Nose */}
      {renderNose(cx, eyeY, noseY, noseLength, effNoseWidth, noseBridge, noseTip, noseCurve, philtrumDepth, mouthY, config.hasBrokenNose)}

      {/* Directional eye socket shadows — deeper on shadow side */}
      <ellipse cx={cx - eyeSpacing - lightSide * 1} cy={eyeY + 1}
        rx={eyeWidth * 0.55} ry={eyeHeight + 2}
        fill={`rgba(0,0,0,${lightSide < 0 ? 0.08 * lightIntensity : 0.03})`} />
      <ellipse cx={cx + eyeSpacing - lightSide * 1} cy={eyeY + 1}
        rx={eyeWidth * 0.55} ry={eyeHeight + 2}
        fill={`rgba(0,0,0,${lightSide > 0 ? 0.03 : 0.08 * lightIntensity})`} />

      {/* Eyes with proper eyelids */}
      {renderEyeWithLid(cx - eyeSpacing, eyeY, eyeWidth, eyeHeight, eyeSlant, eyeLidWeight, epicanthicFold, eyeColor, skin, browInnerL, browOuterL, hairColor, config, underEyeBags, true, uid, gazeOffsetX, gazeOffsetY, eyeShape)}
      {renderEyeWithLid(cx + eyeSpacing, eyeY, eyeWidth, eyeHeight, -eyeSlant, eyeLidWeight, epicanthicFold, eyeColor, skin, browInnerR, browOuterR, hairColor, config, underEyeBags, false, uid, gazeOffsetX, gazeOffsetY, eyeShape)}

      {/* Mouth */}
      {renderMouth(cx, mouthY, mouthWidth, effUpperLip, effLowerLip, mouthCurve, mouthAsym, skin)}

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

      {/* Gold tooth */}
      {config.hasGoldTooth && renderGoldTooth(cx, mouthY, mouthWidth, mouthCurve)}

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

      {/* Quality border glow */}
      {config.quality === 'legendary' && showBg && (
        <rect width="200" height="250" fill="none" stroke="rgba(168,85,247,0.25)" strokeWidth="3" rx="2" />
      )}
      {config.quality === 'rare' && showBg && (
        <rect width="200" height="250" fill="none" stroke="rgba(52,211,153,0.2)" strokeWidth="2" rx="2" />
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
  return (
    <g key="ears">
      {/* Left ear */}
      <path
        d={`M ${cx - hw} ${earTop} C ${cx - hw - 6} ${earTop + 2}, ${cx - hw - 7} ${earBot - 2}, ${cx - hw} ${earBot}
            C ${cx - hw - 2} ${earBot - earSize * 0.15}, ${cx - hw - 2} ${earTop + earSize * 0.15}, ${cx - hw} ${earTop} Z`}
        fill={`url(#skin-${uid})`}
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
): React.ReactNode {
  // Broken nose shifts the bridge off-center
  const brkOffset = isBroken ? 2.5 : 0;
  const brkBulge = isBroken ? 1.5 : 0;
  return (
    <g key="nose">
      {/* Bridge shadow */}
      <path
        d={`M ${cx - nb + brkOffset} ${eyeY + 4}
            Q ${cx - nb - curve + brkOffset} ${eyeY + noseLength * 0.5}, ${cx - nw} ${noseY}
            C ${cx - nw * 0.5} ${noseY + tip + 5}, ${cx + nw * 0.5} ${noseY + tip + 5}, ${cx + nw} ${noseY}
            Q ${cx + nb + curve + brkOffset} ${eyeY + noseLength * 0.5}, ${cx + nb + brkOffset} ${eyeY + 4} Z`}
        fill="rgba(0,0,0,0.07)"
      />
      {/* Broken nose bump */}
      {isBroken && (
        <ellipse cx={cx + brkOffset} cy={eyeY + noseLength * 0.35} rx={nb + brkBulge} ry={3} fill="rgba(0,0,0,0.06)" />
      )}
      {/* Nose tip bulb */}
      <ellipse cx={cx} cy={noseY + tip * 0.4} rx={nw - 0.5} ry={3.5 + Math.abs(tip) * 0.3} fill="rgba(0,0,0,0.06)" />
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

  // Iris — proportioned to the visible opening
  const irisR = Math.min(effEh * 0.72, hw * 0.45);
  const pupilR = irisR * 0.4;
  const irisX = ex + gazeX;
  const irisY = ey + gazeY * 0.5 + droopOuter * 0.15;
  const iris = (
    <g key={`${key}-iris`} clipPath={`url(#${key}-clip-${uid})`}>
      <circle cx={irisX} cy={irisY} r={irisR + 0.5} fill="#1a1a1a" opacity={0.12} />
      <circle cx={irisX} cy={irisY} r={irisR} fill={irisColor} />
      <circle cx={irisX} cy={irisY} r={irisR * 0.65} fill="none" stroke={irisColor} strokeWidth="0.5" opacity={0.35} />
      <circle cx={irisX} cy={irisY} r={pupilR} fill="#0a0a0a" />
      {/* Catchlights */}
      <circle cx={irisX + irisR * 0.25} cy={irisY - irisR * 0.25} r={irisR * 0.22} fill="rgba(255,255,255,0.8)" />
      <circle cx={irisX - irisR * 0.15} cy={irisY + irisR * 0.18} r={irisR * 0.1} fill="rgba(255,255,255,0.45)" />
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
      stroke={hairColor} strokeWidth={browThick} fill="none" strokeLinecap="round"
    />
  );

  return <g key={key}>{irisClip}{socket}{sclera}{iris}{lid}{crease}{hoodFold}{lashLine}{lowerLid}{fold}{bags}{brow}</g>;
}

// ── Mouth ────────────────────────────────────────────────

function renderMouth(
  cx: number, my: number, hw: number,
  upperLip: number, lowerLip: number,
  curve: number, asym: number, skin: SkinPalette,
): React.ReactNode {
  const leftY = my + curve - asym;
  const rightY = my + curve + asym;
  const lipColor = skin.blush;

  // Lip shape varies with thickness — thin lips have flatter, tighter curves
  const fullRatio = Math.min(upperLip / 3.5, 1);  // 0 = very thin, 1 = full
  const bowDepth = 0.5 + fullRatio * 1.5;          // cupid's bow prominence
  const cornerTuck = 1 + fullRatio * 0.8;          // how much corners tuck in

  return (
    <g key="mouth">
      {/* Upper lip — cupid's bow depth scales with fullness */}
      <path
        d={`M ${cx - hw} ${leftY}
            C ${cx - hw * 0.4} ${my - upperLip - bowDepth * 0.3}, ${cx - 2} ${my - upperLip - bowDepth}, ${cx} ${my - upperLip * 0.6}
            C ${cx + 2} ${my - upperLip - bowDepth}, ${cx + hw * 0.4} ${my - upperLip - bowDepth * 0.3}, ${cx + hw} ${rightY}
            C ${cx + hw * 0.3} ${my + cornerTuck}, ${cx - hw * 0.3} ${my + cornerTuck}, ${cx - hw} ${leftY} Z`}
        fill={lipColor} opacity={0.5}
      />
      {/* Lower lip */}
      <path
        d={`M ${cx - hw} ${leftY}
            C ${cx - hw * 0.35} ${my + lowerLip + curve * 0.3}, ${cx + hw * 0.35} ${my + lowerLip + curve * 0.3}, ${cx + hw} ${rightY}
            C ${cx + hw * 0.3} ${my + cornerTuck}, ${cx - hw * 0.3} ${my + cornerTuck}, ${cx - hw} ${leftY} Z`}
        fill={lipColor} opacity={0.4}
      />
      {/* Lower lip highlight */}
      <ellipse cx={cx} cy={my + lowerLip * 0.4 + 1} rx={hw * 0.5} ry={lowerLip * 0.3}
        fill="rgba(255,255,255,0.06)" />
      {/* Lip line */}
      <path
        d={`M ${cx - hw} ${leftY} C ${cx - hw * 0.3} ${my + 1}, ${cx + hw * 0.3} ${my + 1}, ${cx + hw} ${rightY}`}
        stroke="rgba(0,0,0,0.4)" strokeWidth="0.9" fill="none"
      />
      {/* Lower lip shadow */}
      <path
        d={`M ${cx - hw + 3} ${my + lowerLip + curve * 0.3 + 1}
            C ${cx - hw * 0.2} ${my + lowerLip + curve * 0.3 + 2.5}, ${cx + hw * 0.2} ${my + lowerLip + curve * 0.3 + 2.5}, ${cx + hw - 3} ${my + lowerLip + curve * 0.3 + 1}`}
        stroke="rgba(0,0,0,0.1)" strokeWidth="0.6" fill="none"
      />
    </g>
  );
}

// ── Wrinkles ─────────────────────────────────────────────

function renderWrinkles(
  cx: number, eyeY: number, noseY: number, mouthY: number,
  eyeSpacing: number, noseWidth: number, headWidth: number, alpha: number,
): React.ReactNode {
  return (
    <g key="wrinkles" stroke="rgba(0,0,0,0.18)" strokeWidth="0.7" fill="none" opacity={alpha}>
      <path d={`M ${cx - noseWidth - 3} ${noseY + 2} Q ${cx - 20} ${mouthY}, ${cx - 22} ${mouthY + 8}`} />
      <path d={`M ${cx + noseWidth + 3} ${noseY + 2} Q ${cx + 20} ${mouthY}, ${cx + 22} ${mouthY + 8}`} />
      <path d={`M ${cx - headWidth + 10} ${eyeY - 30} Q ${cx} ${eyeY - 32} ${cx + headWidth - 10} ${eyeY - 30}`} />
      <path d={`M ${cx - headWidth + 14} ${eyeY - 24} Q ${cx} ${eyeY - 26} ${cx + headWidth - 14} ${eyeY - 24}`} />
      <path d={`M ${cx - eyeSpacing - 9} ${eyeY - 1} l -4 -2 M ${cx - eyeSpacing - 9} ${eyeY + 2} l -4 2`} />
      <path d={`M ${cx + eyeSpacing + 9} ${eyeY - 1} l 4 -2 M ${cx + eyeSpacing + 9} ${eyeY + 2} l 4 2`} />
    </g>
  );
}

// ── Facial hair ──────────────────────────────────────────

function renderFacialHair(
  config: PortraitConfig, rng: () => number,
  cx: number, mouthY: number, _mouthW: number,
  chinY: number, jawW: number, headWidth: number, hairColor: string,
): React.ReactNode {
  const age = ['20s', '30s', '40s', '50s', '60s'].indexOf(config.age);
  if (age === 0 && rng() > 0.3) return null;

  const paths: React.ReactNode[] = [];
  const r1 = rng(), r2 = rng(), r3 = rng();

  const beardLikelihood = config.culturalGroup === 'ArabPersian' ? 0.85 :
    config.culturalGroup === 'Indian' ? 0.75 :
    config.culturalGroup === 'NorthEuropean' ? 0.5 :
    config.culturalGroup === 'SouthEuropean' ? 0.55 :
    config.culturalGroup === 'EastAsian' ? 0.15 :
    config.culturalGroup === 'SoutheastAsian' ? 0.2 :
    config.culturalGroup === 'Swahili' ? 0.6 : 0.4;

  const mustacheLikelihood = beardLikelihood + 0.1;

  if (r1 < mustacheLikelihood) {
    const mW = 12 + r2 * 8;
    const mDrop = r3 * 5;
    const mThick = 2.5 + rng() * 3;
    const handlebar = config.culturalGroup === 'Indian' || config.culturalGroup === 'ArabPersian' ? rng() > 0.3 : rng() > 0.7;

    if (handlebar) {
      paths.push(
        <path key="mustache"
          d={`M ${cx - mW} ${mouthY - 3 + mDrop}
              C ${cx - mW * 0.5} ${mouthY - 6 - mThick}, ${cx + mW * 0.5} ${mouthY - 6 - mThick}, ${cx + mW} ${mouthY - 3 + mDrop}
              C ${cx + mW * 0.5} ${mouthY - 4 + mThick * 0.3}, ${cx - mW * 0.5} ${mouthY - 4 + mThick * 0.3}, ${cx - mW} ${mouthY - 3 + mDrop} Z`}
          fill={hairColor} />
      );
    } else {
      paths.push(
        <path key="mustache"
          d={`M ${cx - mW} ${mouthY - 2}
              C ${cx - mW * 0.3} ${mouthY - 5 - mThick}, ${cx + mW * 0.3} ${mouthY - 5 - mThick}, ${cx + mW} ${mouthY - 2}
              C ${cx + mW * 0.3} ${mouthY - 1}, ${cx - mW * 0.3} ${mouthY - 1}, ${cx - mW} ${mouthY - 2} Z`}
          fill={hairColor} />
      );
    }
  }

  if (r2 < beardLikelihood && rng() > 0.3) {
    const beardType = rng();
    if (beardType > 0.6) {
      const bLen = 10 + rng() * 18;
      paths.push(
        <path key="beard"
          d={`M ${cx - headWidth + 4} ${mouthY - 8}
              C ${cx - headWidth} ${chinY}, ${cx - jawW} ${chinY + bLen}, ${cx} ${chinY + bLen + 4}
              C ${cx + jawW} ${chinY + bLen}, ${cx + headWidth} ${chinY}, ${cx + headWidth - 4} ${mouthY - 8}
              C ${cx + 14} ${mouthY + 4}, ${cx - 14} ${mouthY + 4}, ${cx - headWidth + 4} ${mouthY - 8} Z`}
          fill={hairColor} />
      );
    } else if (beardType > 0.3) {
      const gW = 8 + rng() * 6, gLen = 6 + rng() * 12;
      paths.push(
        <path key="goatee"
          d={`M ${cx - gW} ${mouthY + 4}
              C ${cx - gW} ${chinY + gLen}, ${cx + gW} ${chinY + gLen}, ${cx + gW} ${mouthY + 4}
              C ${cx + gW * 0.3} ${mouthY + 6}, ${cx - gW * 0.3} ${mouthY + 6}, ${cx - gW} ${mouthY + 4} Z`}
          fill={hairColor} />
      );
    } else {
      paths.push(
        <ellipse key="stubble" cx={cx} cy={chinY - 5} rx={jawW - 2} ry={chinY - mouthY + 4}
          fill={hairColor} opacity={0.2} />
      );
    }
  }

  return paths.length > 0 ? <g key="facial-hair">{paths}</g> : null;
}

// ── Scar ─────────────────────────────────────────────────

function renderScar(
  _config: PortraitConfig, rng: () => number,
  cx: number, eyeY: number, eyeSpacing: number,
): React.ReactNode {
  const side = rng() > 0.5 ? 1 : -1;
  if (rng() > 0.5) {
    const sx = cx + side * (eyeSpacing + 5);
    return (
      <path key="scar" d={`M ${sx} ${eyeY + 6} l ${side * 7} ${9 + rng() * 4}`}
        stroke="rgba(180,140,120,0.45)" strokeWidth="1.3" fill="none" strokeLinecap="round" />
    );
  } else {
    const sx = cx + side * eyeSpacing;
    return (
      <path key="scar" d={`M ${sx - 3} ${eyeY - 9} l 2 9`}
        stroke="rgba(180,140,120,0.45)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    );
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
  cx: number, headTop: number, hw: number, hairColor: string,
): React.ReactNode {
  if (config.gender === 'Female') {
    return (
      <path key="back-hair"
        d={`M ${cx - hw - 6} ${headTop + 15}
            C ${cx - hw - 15} ${headTop + 60}, ${cx - hw - 12} ${headTop + 120}, ${cx - hw + 5} ${headTop + 140}
            L ${cx + hw - 5} ${headTop + 140}
            C ${cx + hw + 12} ${headTop + 120}, ${cx + hw + 15} ${headTop + 60}, ${cx + hw + 6} ${headTop + 15} Z`}
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
  return null;
}

// ── Front hair ───────────────────────────────────────────

function renderFrontHair(
  config: PortraitConfig, rng: () => number,
  cx: number, headTop: number, hw: number, eyeY: number,
  foreheadH: number, hairColor: string,
): React.ReactNode {
  if (willHaveFullHeadwear(config, rng)) return null;
  const age = ['20s', '30s', '40s', '50s', '60s'].indexOf(config.age);

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
    const partSide = rng() > 0.5 ? -1 : 1;
    return (
      <g key="front-hair">
        <path
          d={`M ${cx} ${headTop - 2}
              C ${cx - hw * 0.6} ${headTop - 4}, ${cx - hw - 4} ${headTop + 8}, ${cx - hw - 3} ${eyeY - 8}
              C ${cx - hw + 5} ${headTop + foreheadH + 5}, ${cx - 8} ${headTop + 6}, ${cx} ${headTop + 4}
              C ${cx + 8} ${headTop + 6}, ${cx + hw - 5} ${headTop + foreheadH + 5}, ${cx + hw + 3} ${eyeY - 8}
              C ${cx + hw + 4} ${headTop + 8}, ${cx + hw * 0.6} ${headTop - 4}, ${cx} ${headTop - 2} Z`}
          fill={hairColor} />
        <ellipse cx={cx + partSide * 4} cy={headTop - 1} rx={hw - 2} ry={6} fill={hairColor} />
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

  if (config.isSailor && gender === 'Male' && culturalGroup !== 'ArabPersian' && culturalGroup !== 'Indian' && rng() > 0.45) {
    const capColors = ['#4a3828', '#2a3a4a', '#3a4a3a', '#5c2828', '#2a2a40'];
    const capColor = capColors[Math.floor(rng() * capColors.length)];
    return (
      <g key="knit-cap">
        <path d={`M ${cx - hw - 1} ${headTop + 8}
            C ${cx - hw - 1} ${headTop - 8}, ${cx + hw + 1} ${headTop - 8}, ${cx + hw + 1} ${headTop + 8} Z`}
          fill={capColor} />
        <path d={`M ${cx - hw - 2} ${headTop + 6} L ${cx + hw + 2} ${headTop + 6}`}
          stroke="rgba(0,0,0,0.2)" strokeWidth="2.5" />
      </g>
    );
  }

  if (socialClass === 'Noble' && gender === 'Male' &&
    (culturalGroup === 'NorthEuropean' || culturalGroup === 'SouthEuropean') && rng() > 0.4) {
    return (
      <g key="tall-hat">
        <path d={`M ${cx - hw + 6} ${headTop + 4} L ${cx - hw + 8} ${headTop - 24}
            C ${cx - hw + 8} ${headTop - 30}, ${cx + hw - 8} ${headTop - 30}, ${cx + hw - 8} ${headTop - 24}
            L ${cx + hw - 6} ${headTop + 4} Z`}
          fill="#1a1a1a" />
        <ellipse cx={cx} cy={headTop + 5} rx={hw + 8} ry={5} fill="#222" />
        <path d={`M ${cx - hw + 7} ${headTop - 8} L ${cx + hw - 7} ${headTop - 8}`}
          stroke="#8a7a40" strokeWidth="2" />
      </g>
    );
  }

  if (gender === 'Female' && socialClass === 'Working') {
    return (
      <path key="coif"
        d={`M ${cx - hw - 4} ${eyeY - 2}
            C ${cx - hw - 6} ${headTop - 4}, ${cx + hw + 6} ${headTop - 4}, ${cx + hw + 4} ${eyeY - 2}
            C ${cx + hw + 5} ${eyeY + 20}, ${cx + hw + 6} ${eyeY + 40}, ${cx + hw + 4} ${eyeY + 50}
            L ${cx - hw - 4} ${eyeY + 50}
            C ${cx - hw - 6} ${eyeY + 40}, ${cx - hw - 5} ${eyeY + 20}, ${cx - hw - 4} ${eyeY - 2} Z`}
        fill="#f0ede6" stroke="#d8d0c4" strokeWidth="0.8" />
    );
  }

  return null;
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
    if (socialClass === 'Noble') {
      const ruffY = torsoTop - 3;
      for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI;
        const rx = cx + Math.cos(angle) * 28 - 14;
        const ry = ruffY + Math.sin(angle) * 6;
        paths.push(<ellipse key={`ruff-${i}`} cx={rx} cy={ry} rx={6} ry={3}
          fill="#f0ece4" stroke="#d8d0c4" strokeWidth="0.5"
          transform={`rotate(${(i / 10) * 180 - 90} ${rx} ${ry})`} />);
      }
      paths.push(<path key="trim" d={`M ${cx - 2} ${torsoTop} L ${cx - 2} 250`} stroke={color2} strokeWidth="3" />);
    } else if (socialClass === 'Merchant') {
      paths.push(<path key="collar" d={`M ${cx - 16} ${torsoTop - 2} L ${cx} ${torsoTop + 14} L ${cx + 16} ${torsoTop - 2}`}
        fill="#e0d8c8" stroke="#c8c0b0" strokeWidth="0.5" />);
    } else {
      paths.push(<path key="shirt-v" d={`M ${cx - 10} ${torsoTop - 2} L ${cx} ${torsoTop + 10} L ${cx + 10} ${torsoTop - 2}`}
        fill={skin.mid} stroke="rgba(0,0,0,0.1)" strokeWidth="0.5" />);
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

// ── Gold tooth ───────────────────────────────────────────

function renderGoldTooth(
  cx: number, mouthY: number, mouthWidth: number, mouthCurve: number,
): React.ReactNode {
  // Only visible if mouth is curved into a smile (negative curve = smile)
  if (mouthCurve > -1) return null;
  const toothX = cx + 3;
  const toothY = mouthY + 0.5;
  return (
    <rect key="gold-tooth" x={toothX - 1} y={toothY - 1} width={2.5} height={2.5}
      fill="#d4a020" rx={0.5} opacity={0.8} />
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

export default CrewPortrait;
