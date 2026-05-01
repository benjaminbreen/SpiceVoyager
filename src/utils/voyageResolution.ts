import type { CrewMember, ShipStats } from '../store/gameStore';
import { estimateSeaTravel, getWorldPortById, PORT_REGIONS, type WorldRegion } from './worldPorts';

export type VoyageStance = 'press' | 'standard' | 'cautious';
export type VoyageRisk = 'Low' | 'Moderate' | 'High';
export type VoyageEventTone = 'good' | 'neutral' | 'warning' | 'danger';

export interface VoyageEventResult {
  day: number;
  title: string;
  text: string;
  tone: VoyageEventTone;
}

export interface VoyageIncidentChoice {
  id: string;
  label: string;
  detail: string;
  resultText: string;
  hullDamageDelta?: number;
  provisionCostDelta?: number;
  moraleDelta?: number;
  actualDaysDelta?: number;
}

export interface VoyageIncident {
  title: string;
  text: string;
  choices?: [VoyageIncidentChoice, VoyageIncidentChoice];
  autoResult?: VoyageIncidentChoice;
}

export interface VoyageResolution {
  fromPortId: string;
  toPortId: string;
  fromPortName: string;
  toPortName: string;
  fromRegion: WorldRegion;
  toRegion: WorldRegion;
  stance: VoyageStance;
  baseDays: number;
  actualDays: number;
  distanceKm: number;
  risk: VoyageRisk;
  provisionCost: number;
  hullDamage: number;
  moraleDelta: number;
  routeKey: string;
  routeKnown: boolean;
  chartedRoute: boolean;
  roleEffects: string[];
  incident: VoyageIncident;
  incidentChoiceId?: string;
  events: VoyageEventResult[];
}

export interface VoyageResolutionInput {
  fromPortId: string;
  toPortId: string;
  stance: VoyageStance;
  crew: CrewMember[];
  stats: ShipStats;
  provisions: number;
  dayCount: number;
  chartedRoutes?: string[];
  weatherIntensity?: number;
  windSpeed?: number;
}

const STANCE_COPY: Record<VoyageStance, { label: string; verb: string }> = {
  press: { label: 'Press Sail', verb: 'pressed sail' },
  standard: { label: 'Standard Passage', verb: 'held a steady passage' },
  cautious: { label: 'Stand Off & Sound', verb: 'stood off and sounded the coast' },
};

function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function riskScore(risk: VoyageRisk): number {
  if (risk === 'High') return 3;
  if (risk === 'Moderate') return 2;
  return 1;
}

function roleSkill(crew: CrewMember[], role: string): number {
  return crew.find((member) => member.role === role && member.health === 'healthy')?.skill ?? 0;
}

export function voyageRouteKey(fromPortId: string, toPortId: string): string {
  return [fromPortId, toPortId].sort().join(':');
}

function regionLabel(region: WorldRegion): string {
  switch (region) {
    case 'eastAfrica': return 'East African coast';
    case 'eastIndies': return 'East Indies';
    case 'indianOcean': return 'Indian Ocean';
    case 'westAfrica': return 'West African coast';
    case 'atlantic': return 'Atlantic';
    case 'europe': return 'European waters';
  }
}

function chooseIncident(input: VoyageResolutionInput, risk: VoyageRisk, routeKnown: boolean): VoyageIncident {
  const seed = hashString(`incident:${input.fromPortId}:${input.toPortId}:${input.dayCount}:${input.stance}`);
  const pick = seed % 3;
  if (pick === 0) {
    return {
      title: 'Squall Line',
      text: routeKnown
        ? 'The navigator recognizes the weather line from an earlier passage.'
        : 'A black squall line rises across the course before sunset.',
      choices: [
        {
          id: 'reef',
          label: 'Reef sails',
          detail: 'Lose time, spare the hull.',
          resultText: 'Sails were shortened before the squall struck.',
          actualDaysDelta: 1,
          hullDamageDelta: -3,
        },
        {
          id: 'drive',
          label: 'Drive through',
          detail: 'Keep speed, risk damage.',
          resultText: 'The ship drove through under heavy canvas.',
          hullDamageDelta: risk === 'High' ? 5 : 3,
          moraleDelta: -1,
        },
      ],
    };
  }
  if (pick === 1) {
    return {
      title: 'Strange Sail',
      text: 'A sail holds the same quarter through the afternoon watch.',
      choices: [
        {
          id: 'alter',
          label: 'Alter course',
          detail: 'Lose a day, avoid trouble.',
          resultText: 'The ship altered course at dusk and lost the stranger.',
          actualDaysDelta: 1,
          provisionCostDelta: 1,
        },
        {
          id: 'show',
          label: 'Show colors',
          detail: 'Hold course and stand ready.',
          resultText: 'Colors were shown and the guns kept clear.',
          moraleDelta: -1,
          hullDamageDelta: risk === 'Low' ? 0 : 2,
        },
      ],
    };
  }
  return {
    title: 'Water Casks',
    text: 'Two casks are found sour when the cooper knocks them open.',
    choices: [
      {
        id: 'ration',
        label: 'Ration water',
        detail: 'Save stores, hurt morale.',
        resultText: 'Two casks sour. Water rationed by watch.',
        provisionCostDelta: -2,
        moraleDelta: -2,
      },
      {
        id: 'landfall',
        label: 'Make slower landfall',
        detail: 'Lose a day finding safer water.',
        resultText: 'The ship made a slower approach in search of clean water.',
        actualDaysDelta: 1,
        provisionCostDelta: 1,
      },
    ],
  };
}

function applyVoyageIncidentResult(
  resolution: VoyageResolution,
  result: VoyageIncidentChoice,
): VoyageResolution {
  const eventDay = Math.max(1, Math.min(resolution.actualDays, Math.round(resolution.actualDays * 0.55)));
  const chosenEvent: VoyageEventResult = {
    day: eventDay,
    title: resolution.incident.title,
    text: result.resultText,
    tone: (result.hullDamageDelta ?? 0) > 0 || (result.moraleDelta ?? 0) < 0 ? 'warning' : 'neutral',
  };
  return {
    ...resolution,
    actualDays: Math.max(1, resolution.actualDays + (result.actualDaysDelta ?? 0)),
    provisionCost: Math.max(0, resolution.provisionCost + (result.provisionCostDelta ?? 0)),
    hullDamage: Math.max(0, resolution.hullDamage + (result.hullDamageDelta ?? 0)),
    moraleDelta: Math.max(-20, Math.min(10, resolution.moraleDelta + (result.moraleDelta ?? 0))),
    incidentChoiceId: result.id,
    events: [...resolution.events, chosenEvent].sort((a, b) => a.day - b.day),
  };
}

export function applyVoyageIncidentChoice(
  resolution: VoyageResolution,
  choiceId: string,
): VoyageResolution {
  const choice = resolution.incident.choices?.find((candidate) => candidate.id === choiceId)
    ?? (resolution.incident.autoResult?.id === choiceId ? resolution.incident.autoResult : undefined);
  return choice ? applyVoyageIncidentResult(resolution, choice) : resolution;
}

function routeEvent(region: WorldRegion, day: number): VoyageEventResult {
  const label = regionLabel(region);
  if (region === 'indianOcean') {
    return {
      day,
      title: 'Monsoon Run',
      text: 'The helmsman kept the lateen drawing while warm rain crossed the deck in short bursts.',
      tone: 'neutral',
    };
  }
  if (region === 'eastAfrica') {
    return {
      day,
      title: 'Coast Current',
      text: 'A long current set along the coast. The leadman called depths while reefs showed pale under the swell.',
      tone: 'neutral',
    };
  }
  if (region === 'eastIndies') {
    return {
      day,
      title: 'Narrow Water',
      text: 'Squalls moved between the islands and the watch doubled near dusk.',
      tone: 'warning',
    };
  }
  if (region === 'atlantic') {
    return {
      day,
      title: 'Open Sea',
      text: 'The ship ran under a long swell with no land birds and no smoke on the horizon.',
      tone: 'neutral',
    };
  }
  return {
    day,
    title: label,
    text: 'The navigator checked the traverse board at each watch and kept the course plain.',
    tone: 'neutral',
  };
}

export function resolveVoyage(input: VoyageResolutionInput): VoyageResolution {
  const from = getWorldPortById(input.fromPortId);
  const to = getWorldPortById(input.toPortId);
  const estimate = estimateSeaTravel(input.fromPortId, input.toPortId);
  if (!from || !to || !estimate) {
    throw new Error(`Cannot resolve voyage from ${input.fromPortId} to ${input.toPortId}`);
  }

  const fromRegion = PORT_REGIONS[input.fromPortId] ?? 'indianOcean';
  const toRegion = PORT_REGIONS[input.toPortId] ?? 'indianOcean';
  const routeKey = voyageRouteKey(input.fromPortId, input.toPortId);
  const routeKnown = input.chartedRoutes?.includes(routeKey) ?? false;
  const seed = hashString(`${input.fromPortId}:${input.toPortId}:${input.stance}:${input.dayCount}`);
  const rng = mulberry32(seed);
  const baseDays = estimate.days;
  const risk = estimate.risk as VoyageRisk;
  const riskValue = riskScore(risk);
  const navigatorSkill = roleSkill(input.crew, 'Navigator');
  const surgeonSkill = roleSkill(input.crew, 'Surgeon');
  const navigatorBonus = navigatorSkill >= 16 ? 0.9 : navigatorSkill >= 10 ? 0.96 : 1;
  const routeMemoryBonus = routeKnown ? 0.88 : 1;
  const weatherPressure = (input.weatherIntensity ?? 0) * 0.8 + Math.max(0, (input.windSpeed ?? 0.5) - 0.65);
  const hullRatio = input.stats.maxHull > 0 ? input.stats.hull / input.stats.maxHull : 1;

  const stanceDayMod = input.stance === 'press' ? 0.82 : input.stance === 'cautious' ? 1.18 : 1;
  const actualDays = Math.max(1, Math.round(baseDays * stanceDayMod * navigatorBonus));
  const dailyConsumption = Math.ceil(input.crew.length * 0.5);
  const provisionMod = input.stance === 'press' ? 0.92 : input.stance === 'cautious' ? 1.08 : 1;
  const provisionCost = Math.max(1, Math.ceil(dailyConsumption * actualDays * provisionMod));

  const stanceRisk = input.stance === 'press' ? 1.35 : input.stance === 'cautious' ? 0.62 : 1;
  const hullPressure = hullRatio < 0.35 ? 1.5 : hullRatio < 0.65 ? 1.18 : 1;
  const rawHazard = (riskValue * 2.2 + weatherPressure * 3.5 + rng() * 3.5) * stanceRisk * hullPressure * routeMemoryBonus;
  const hullDamage = Math.max(0, Math.round(rawHazard - 3.5));

  const shortRations = input.provisions < provisionCost;
  const moraleDelta = shortRations
    ? -Math.max(2, Math.ceil((provisionCost - input.provisions) / Math.max(1, input.crew.length)))
    : input.stance === 'press'
      ? -1
      : input.stance === 'cautious' && surgeonSkill >= 10
        ? 1
        : 0;
  const roleEffects: string[] = [];
  if (navigatorSkill >= 16) roleEffects.push('Navigator: strong fix, shorter passage');
  else if (navigatorSkill >= 10) roleEffects.push('Navigator: steadier course');
  if (surgeonSkill >= 10 && input.stance === 'cautious' && !shortRations) roleEffects.push('Surgeon: crew kept steady');
  if (routeKnown) roleEffects.push('Route charted: lower hull risk');

  const events: VoyageEventResult[] = [];
  events.push({
    day: 1,
    title: STANCE_COPY[input.stance].label,
    text: `The captain ${STANCE_COPY[input.stance].verb}; the course was set for ${to.name}.`,
    tone: input.stance === 'press' ? 'warning' : input.stance === 'cautious' ? 'good' : 'neutral',
  });
  if (actualDays > 2) {
    events.push(routeEvent(toRegion !== fromRegion ? toRegion : fromRegion, Math.max(2, Math.round(actualDays * 0.45))));
  }
  if (hullDamage > 0) {
    events.push({
      day: Math.max(1, Math.round(actualDays * 0.68)),
      title: hullDamage >= 8 ? 'Hard Weather' : 'Working Sea',
      text: hullDamage >= 8
        ? 'A hard sea opened seams in the waist. The carpenter set men to pumps before dawn.'
        : 'The ship labored in a cross swell and shipped enough water to keep the pumps manned.',
      tone: hullDamage >= 8 ? 'danger' : 'warning',
    });
  } else if (input.stance === 'cautious') {
    events.push({
      day: Math.max(1, Math.round(actualDays * 0.7)),
      title: 'Good Soundings',
      text: 'The slower approach found clean water and spared the hull from the shoals.',
      tone: 'good',
    });
  }
  if (shortRations) {
    events.push({
      day: actualDays,
      title: 'Short Rations',
      text: 'The last days were made on tight water and thinner meals than the crew liked.',
      tone: 'danger',
    });
  }

  return {
    fromPortId: input.fromPortId,
    toPortId: input.toPortId,
    fromPortName: from.name,
    toPortName: to.name,
    fromRegion,
    toRegion,
    stance: input.stance,
    baseDays,
    actualDays,
    distanceKm: estimate.distanceKm,
    risk,
    provisionCost,
    hullDamage,
    moraleDelta,
    routeKey,
    routeKnown,
    chartedRoute: !routeKnown,
    roleEffects,
    incident: chooseIncident(input, risk, routeKnown),
    events: events
      .sort((a, b) => a.day - b.day)
      .filter((event, index, list) => index === 0 || event.title !== list[index - 1].title),
  };
}
