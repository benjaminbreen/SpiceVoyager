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

export function getWindTrimInfo(windDirection: number, heading: number): WindTrimInfo {
  const angle = Math.abs(Math.atan2(
    Math.sin(windDirection - heading),
    Math.cos(windDirection - heading),
  ));

  let grade: WindTrimGrade = 'none';
  let label = 'No purchase';
  if (angle <= FULL_TRIM_ANGLE) {
    grade = 'full';
    label = 'Full canvas';
  } else if (angle <= GOOD_TRIM_ANGLE) {
    grade = 'good';
    label = 'Good trim';
  } else if (angle <= REACH_TRIM_ANGLE) {
    grade = 'reach';
    label = 'Quartering wind';
  }

  let score = 0;
  if (angle <= FULL_TRIM_ANGLE) {
    score = 1;
  } else if (angle <= REACH_TRIM_ANGLE) {
    score = clamp01((REACH_TRIM_ANGLE - angle) / (REACH_TRIM_ANGLE - FULL_TRIM_ANGLE));
  }

  return { angle, score, grade, label };
}

export function getWindTrimMultiplier(windSpeed: number, trimScore: number, trimCharge: number): number {
  return 1 + clamp01(trimCharge) * clamp01(trimScore) * (0.24 + clamp01(windSpeed) * 0.56);
}
