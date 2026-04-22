export type WindTrimGrade = 'full' | 'good' | 'reach' | 'none';

export interface WindTrimInfo {
  angle: number;
  score: number;
  grade: WindTrimGrade;
  label: string;
}

const FULL_TRIM_ANGLE = Math.PI * 0.2;
const GOOD_TRIM_ANGLE = Math.PI * 0.38;
const REACH_TRIM_ANGLE = Math.PI * 0.58;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Compute how well a given heading uses the wind.
 *
 * `windward` (0–1) widens or narrows the usable arc. At `windward = 0.5` the
 * thresholds match the original tuning so every existing caller that doesn't
 * pass a value keeps today's behavior. Lateen rigs (≈0.85–0.90) extend the
 * "reach" threshold toward 150° off-downwind — i.e. they can beat to
 * windward; square-riggers (≈0.35–0.45) shrink it so close-hauled angles
 * fall into the dead zone faster.
 */
export function getWindTrimInfo(
  windDirection: number,
  heading: number,
  windward: number = 0.5,
): WindTrimInfo {
  const angle = Math.abs(Math.atan2(
    Math.sin(windDirection - heading),
    Math.cos(windDirection - heading),
  ));

  // Scale the good/reach thresholds by windward. The factor is tuned so that
  // windward=0.5 recovers the original GOOD/REACH constants (1.0×), windward=1
  // pushes the reach threshold to about 0.80π, and windward=0 shrinks it to
  // about 0.36π. FULL_TRIM_ANGLE (downwind) is universal.
  const reachAngle = REACH_TRIM_ANGLE * (0.62 + windward * 0.76);
  const goodAngle = GOOD_TRIM_ANGLE * (0.72 + windward * 0.56);

  let grade: WindTrimGrade = 'none';
  let label = 'No purchase';
  if (angle <= FULL_TRIM_ANGLE) {
    grade = 'full';
    label = 'Full canvas';
  } else if (angle <= goodAngle) {
    grade = 'good';
    label = 'Good trim';
  } else if (angle <= reachAngle) {
    grade = 'reach';
    label = 'Quartering wind';
  }

  let score = 0;
  if (angle <= FULL_TRIM_ANGLE) {
    score = 1;
  } else if (angle <= reachAngle) {
    score = clamp01((reachAngle - angle) / (reachAngle - FULL_TRIM_ANGLE));
  }

  return { angle, score, grade, label };
}

export function getWindTrimMultiplier(windSpeed: number, trimScore: number, trimCharge: number): number {
  return 1 + clamp01(trimCharge) * clamp01(trimScore) * (0.24 + clamp01(windSpeed) * 0.56);
}
