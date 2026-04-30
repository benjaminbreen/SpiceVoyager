import type { Building, BuildingType, Port, WeatherState } from '../store/gameStore';
import { DISTRICT_LABELS } from './cityDistricts';
import type { PresentPedestrian } from './pedestrianPresence';

type NearbyBuilding = {
  building: Building;
  distance: number;
};

interface LandmarkNote {
  identity: string;
  setting?: string;
}

export interface BuildingDescriptionContext {
  timeOfDay: number;
  weather: WeatherState;
}

const TYPE_NOUN: Record<BuildingType, string> = {
  dock: 'dock',
  warehouse: 'warehouse',
  fort: 'fort',
  estate: 'estate',
  house: 'house',
  farmhouse: 'farmhouse',
  shack: 'shack',
  market: 'market',
  plaza: 'plaza',
  spiritual: 'place of worship',
  landmark: 'landmark',
  palace: 'palace',
};

const IMPORTANT_TYPES = new Set<BuildingType>(['dock', 'warehouse', 'fort', 'market', 'plaza', 'spiritual', 'landmark', 'palace']);
const COMMERCIAL_TYPES = new Set<BuildingType>(['dock', 'warehouse', 'market']);
const AUTHORITY_TYPES = new Set<BuildingType>(['fort', 'palace']);
const RELIGIOUS_TYPES = new Set<BuildingType>(['spiritual', 'landmark']);
const CIVIC_TYPES = new Set<BuildingType>(['fort', 'palace', 'plaza']);
const RESIDENTIAL_TYPES = new Set<BuildingType>(['house', 'estate', 'shack']);

const LANDMARK_DESCRIPTION_NOTES: Record<string, LandmarkNote> = {
  'bom-jesus-basilica': {
    identity: 'The Basilica of Bom Jesus is a major Catholic church in Portuguese Goa.',
  },
  'colegio-sao-paulo': {
    identity: 'The College of Sao Paulo is Macau\'s Jesuit college, tied to the city\'s missionary and scholarly life.',
  },
  'fort-jesus': {
    identity: 'Fort Jesus is the Portuguese fortress at Mombasa, built to control the harbor approaches.',
  },
  'calicut-gopuram': {
    identity: 'This temple gateway marks Calicut\'s older sacred geography inside a busy Malabar port.',
  },
  'english-factory-surat': {
    identity: 'The English Factory is Surat\'s new Company foothold, opened only recently in Mughal territory.',
  },
  'al-shadhili-mosque': {
    identity: 'The Al-Shadhili Mosque marks Mocha\'s religious landscape close to the Red Sea coffee trade.',
  },
  'san-agustin-manila': {
    identity: 'San Agustin is the Augustinian church inside Spanish Manila.',
  },
  'grand-mosque-tiered': {
    identity: 'Mesjid Agung Banten is the city\'s principal mosque, marked by the tiered Javanese roofline used for major mosques in the region.',
  },
  'diu-fortress': {
    identity: 'Diu Fortress is the Portuguese stronghold guarding the island and its Gulf of Cambay routes.',
  },
  'belem-tower': {
    identity: 'Belem Tower guards Lisbon\'s river approach, facing the outward route of Portuguese ocean trade.',
  },
  'oude-kerk-spire': {
    identity: 'The Oude Kerk is Amsterdam\'s old parish church, standing inside the dense commercial city.',
  },
  'giralda-tower': {
    identity: 'La Giralda is Seville\'s cathedral bell tower, adapted from the city\'s former Almohad minaret.',
    setting: 'It belongs to the cathedral precinct rather than the working harbor.',
  },
  'tower-of-london': {
    identity: 'The Tower of London is a royal fortress on the Thames, still part prison, armory, and symbol of crown authority.',
  },
  'campanile-san-marco': {
    identity: 'The Campanile of San Marco rises over Venice\'s civic and religious center.',
  },
  'elmina-castle': {
    identity: 'Elmina Castle is the Portuguese fortress and trading post on the Gold Coast.',
  },
  'jesuit-college': {
    identity: 'The Jesuit college at Nagasaki belongs to the short-lived Catholic presence before the coming expulsion orders.',
  },
  'palacio-inquisicion': {
    identity: 'The Palacio de la Inquisicion represents Spanish royal and ecclesiastical authority in Cartagena.',
  },
  'church-of-the-assumption': {
    identity: 'The Church of the Assumption marks Jamestown\'s English settlement with a modest parish presence.',
  },
  'dutch-factory-masulipatnam': {
    identity: 'The Dutch factory at Masulipatnam is a Company trading house on the Coromandel coast.',
  },
};

export function buildingDescription(
  building: Building,
  port: Port,
  presentPeople: PresentPedestrian[] = [],
  context?: BuildingDescriptionContext,
): string {
  const nearby = nearestImportantBuildings(building, port.buildings);
  const district = districtPhrase(building);
  const title = building.label ?? article(TYPE_NOUN[building.type]);
  const identity = identitySentence(building, port, district, title);
  const setting = settingSentence(building, port, nearby);
  const activity = activitySentence(building, presentPeople, nearby, context);

  return [identity, setting, activity].filter(Boolean).join(' ');
}

function identitySentence(building: Building, port: Port, district: string, title: string): string {
  const note = landmarkNote(building);
  if (note) return note.identity;

  if (building.landmarkId) {
    const kind = building.labelSub ?? `${semanticKind(building)} landmark`;
    return `${title} is ${landmarkArticle(kind)} in ${port.name}, set ${district}.`;
  }

  if (building.type === 'spiritual') {
    const faith = faithLabel(building.faith);
    return `${title} is ${faith} place of worship in ${port.name}, set ${district}.`;
  }

  if (building.type === 'palace') {
    const style = building.palaceStyle ? ` ${building.palaceStyle.replace(/-/g, ' ')}` : '';
    return `${title} is${style} seat of authority in ${port.name}, set apart ${district}.`;
  }

  if (building.type === 'fort') {
    return `${title} is a defensive work in ${port.name}, anchoring ${district}.`;
  }

  if (building.type === 'market') {
    return `${title} is one of ${port.name}'s commercial anchors, set ${district}.`;
  }

  if (building.type === 'dock' || building.type === 'warehouse') {
    return `${title} is part of ${port.name}'s working trade front, tied to ${district}.`;
  }

  if (building.type === 'house' || building.type === 'estate' || building.type === 'shack') {
    const classLabel = building.housingClass ? `${building.housingClass} ` : '';
    const household = householdIdentity(building);
    return `${title} is ${household ?? article(`${classLabel}residence`)} ${district} in ${port.name}.`;
  }

  if (building.type === 'farmhouse') {
    const crop = building.household?.good ?? (building.crop ? cropLabel(building.crop) : undefined);
    const cropText = crop ? `, with ${crop} nearby` : '';
    return `${title} is a farmhouse ${district} in ${port.name}${cropText}.`;
  }

  return `${title} is a ${TYPE_NOUN[building.type]} ${district} in ${port.name}.`;
}

function settingSentence(building: Building, port: Port, nearby: NearbyBuilding[]): string {
  const note = landmarkNote(building);
  if (note?.setting) return note.setting;

  const commercial = nearestOf(nearby, COMMERCIAL_TYPES);
  const authority = nearestOf(nearby, AUTHORITY_TYPES);
  const religious = nearestSemanticNeighbor(building, nearby, RELIGIOUS_TYPES);
  const civic = nearestSemanticNeighbor(building, nearby, CIVIC_TYPES);
  const residential = nearestSemanticNeighbor(building, nearby, RESIDENTIAL_TYPES);
  const centerDistance = distance2d(building.position, port.position);
  const ring = portRing(centerDistance, port.scale);

  if (building.type === 'dock') {
    const warehouse = nearestOf(nearby, new Set<BuildingType>(['warehouse']));
    return warehouse ? `Warehouses stand ${distanceHerePhrase(warehouse.distance)}, so goods can move off the quay quickly.` : `It sits on the port edge, where roads begin to pull cargo inland.`;
  }

  if (building.type === 'warehouse') {
    const dock = nearestOf(nearby, new Set<BuildingType>(['dock']));
    return dock ? `The nearest dock is ${distanceHerePhrase(dock.distance)}, keeping this storehouse close to incoming cargo.` : `It sits in the trade quarter, close to the routes that feed the harbor.`;
  }

  if (building.type === 'market') {
    return commercial && commercial.building.type !== 'market'
      ? `It lies ${distanceFromPhrase(commercial.distance)} the ${buildingName(commercial.building)}, between town traffic and harbor trade.`
      : `It sits in the ${ring}, where the town's roads converge.`;
  }

  if (building.type === 'spiritual' || building.labelEyebrow?.toLowerCase() === 'religious') {
    if (religious) return `Another sacred building is ${distanceHerePhrase(religious.distance)}, making this part of town read as a religious precinct.`;
    if (civic) return `It stands ${distanceFromPhrase(civic.distance)} the ${buildingName(civic.building)}, close enough to share the higher-status quarter.`;
    if (residential) return `It sits among residences, away from the loudest work of the quay.`;
    return `It sits in the ${ring}, away from the loudest work of the quay.`;
  }

  if (building.type === 'landmark') {
    if (building.labelEyebrow?.toLowerCase() === 'civic' && commercial) {
      return `The ${buildingName(commercial.building)} is ${distanceHerePhrase(commercial.distance)}, keeping trade within view.`;
    }
    if (civic) return `It stands ${distanceFromPhrase(civic.distance)} the ${buildingName(civic.building)}, close to the city's formal authority.`;
    return `It sits in the ${ring}, where it helps orient the surrounding streets.`;
  }

  if (building.type === 'fort') {
    return commercial ? `From here the ${buildingName(commercial.building)} is ${distanceHerePhrase(commercial.distance)}, making the trade front easy to watch.` : `It holds a raised or exposed position on the city's edge.`;
  }

  if (building.type === 'palace') {
    return authority && authority.building.type === 'fort'
      ? `The fort is ${distanceHerePhrase(authority.distance)}, close enough to mark the link between residence and armed authority.`
      : `It sits in the ${ring}, away from the densest waterside work.`;
  }

  if (building.type === 'house' || building.type === 'estate' || building.type === 'shack' || building.type === 'farmhouse') {
    return residenceDetailSentence(building, nearby);
  }

  if (religious) {
    return `A notable religious site is ${distanceHerePhrase(religious.distance)}, giving this part of the city a quieter precinct.`;
  }

  if (commercial) {
    return `The ${buildingName(commercial.building)} is ${distanceHerePhrase(commercial.distance)}, so this spot still feels tied to port traffic.`;
  }

  return `It sits in the ${ring}, away from the most legible landmarks.`;
}

function residenceDetailSentence(building: Building, nearby: NearbyBuilding[]): string {
  const architecture = residenceArchitecturePhrase(building);
  const work = householdWorkPhrase(building, nearby);
  if (architecture && work) return `${architecture} ${work}`;
  return architecture ?? work ?? 'It reads as part of the ordinary housing fabric rather than a public landmark.';
}

function residenceArchitecturePhrase(building: Building): string | undefined {
  const household = building.household;
  const stories = building.stories ?? 1;
  const setback = building.setback ?? 0.35;
  const broad = building.scale[0] > 7 || building.scale[2] > 7;

  if (building.type === 'shack' || household?.kind === 'laboring') {
    return setback < 0.25
      ? 'It is built close to the lane, with patched frontage and little spare space.'
      : 'It is plain and heavily repaired, with a rough yard around it.';
  }

  if (household?.kind === 'elite' || building.housingClass === 'elite' || building.type === 'estate') {
    return setback > 0.55
      ? 'It is set back from the street, with a more formal approach than the houses around it.'
      : 'Its broader frontage and cleaner finish mark a wealthier household.';
  }

  if (household?.kind === 'shop' || household?.kind === 'workshop') {
    return stories >= 2
      ? 'The lower room faces the street, with living space above the work or selling room.'
      : 'Its frontage is practical and open to the street, more workplace than private house.';
  }

  if (building.type === 'farmhouse' || household?.kind === 'farmstead') {
    return 'The building is plain and work-worn, organized around yard, storage, and field access.';
  }

  if (stories >= 3) return 'Upper rooms rise over a narrow frontage, giving the household a little space above the street.';
  if (broad) return 'Its wider footprint suggests a comfortable household rather than a temporary lodging.';
  return 'It is a modest kept house, ordinary in form but tied closely to this quarter.';
}

function householdWorkPhrase(building: Building, nearby: NearbyBuilding[]): string | undefined {
  const household = building.household;
  if (household?.kind === 'farmstead') {
    const crop = household.good ?? (household.crop ? cropLabel(household.crop) : 'cultivation');
    return `The household appears tied to ${crop} rather than town traffic.`;
  }
  if (household?.kind === 'shop') {
    if (household.good) return `The label points to ${household.good} dealing, probably small retail or brokerage rather than bulk storage.`;
    if (household.profession) return `The household is marked as a ${household.profession}, tying it to neighborhood trade.`;
  }
  if (household?.kind === 'workshop' && household.profession) {
    return `The household is marked by ${household.profession} work, so tools and materials would spill into the day-to-day use of the building.`;
  }
  if (household?.kind === 'elite') {
    return household.title
      ? `The title ${household.title} points to rank, office, or local patronage.`
      : 'Its status points to office, patronage, or long-established wealth.';
  }
  if (household?.kind === 'laboring') {
    const commercial = nearestOf(nearby, COMMERCIAL_TYPES);
    if (commercial) return `Its position near the ${buildingName(commercial.building)} suggests work tied to cargo, repair, or daily port labor.`;
    return 'The household reads as working poor, close to the practical routines of the town.';
  }
  return inferredHouseholdWork(building, nearby);
}

function householdIdentity(building: Building): string | undefined {
  const family = building.familyName;
  const household = building.household;
  if (!household) return family ? `the ${family} household` : undefined;
  if (household.kind === 'shop') {
    if (household.good) return family ? `the ${family} family's ${household.good} shop` : article(`${household.good} shop`);
    if (household.profession) return family ? `the ${family} family's ${household.profession} shop` : article(`${household.profession} shop`);
  }
  if (household.kind === 'workshop' && household.profession) {
    return family ? `the ${family} family's ${household.profession} workshop` : article(`${household.profession} workshop`);
  }
  if (household.kind === 'elite') {
    return family ? `the residence of ${household.title ? `${household.title} ` : ''}${family}` : 'an elite residence';
  }
  if (household.kind === 'laboring') return family ? `the ${family} household` : 'a laboring household';
  if (household.kind === 'farmstead') return family ? `the ${family} family farmstead` : 'a farmstead';
  return family ? `the ${family} household` : undefined;
}

function inferredHouseholdWork(building: Building, nearby: NearbyBuilding[]): string | undefined {
  const commercial = nearestOf(nearby, COMMERCIAL_TYPES);
  const civic = nearestOf(nearby, CIVIC_TYPES);
  if (building.district === 'artisan') return 'Its district suggests craft work or small-scale production, though no precise trade is marked.';
  if (commercial) return `Its position near the ${buildingName(commercial.building)} suggests some connection to port trade.`;
  if (civic) return `Its position near the ${buildingName(civic.building)} suggests service to officials, guards, or clients.`;
  return undefined;
}

function activitySentence(
  building: Building,
  presentPeople: PresentPedestrian[],
  nearby: NearbyBuilding[],
  context?: BuildingDescriptionContext,
): string {
  const presentCount = presentPeople.length;
  const attraction = activityNeighbor(building, nearby);
  const place = building.type === 'dock' || building.type === 'warehouse' || building.type === 'market'
    ? 'work around it'
    : 'space around it';
  const gatheringPlace = gatheringPlacePhrase(building);
  const time = context ? timeContext(context.timeOfDay) : undefined;
  const weather = context ? weatherContext(context.weather) : undefined;
  const conditions = conditionPhrase(weather?.opener, time?.opener);

  if (presentCount === 0) {
    if (time?.period === 'night') {
      return `${conditions ? `${conditions}, ` : ''}no one is gathered ${gatheringPlace}; the household is likely shut for the night.`;
    }
    if (weather?.wet && building.type !== 'dock') {
      return `${conditions ? `${conditions}, ` : ''}no one is gathered ${gatheringPlace}; people seem to be keeping under cover.`;
    }
    if (time?.period === 'afternoon' && attraction && attraction.distance < 36) {
      return `Despite the afternoon traffic near the ${buildingName(attraction.building)}, no one is gathered ${gatheringPlace}.`;
    }
    return attraction && attraction.distance < 24
      ? `No one is gathered ${gatheringPlace} now, though movement continues nearby.`
      : `No one is gathered ${gatheringPlace} now.`;
  }
  const first = presentPeople[0];
  const role = first?.role ? first.role.toLowerCase() : 'person';
  if (presentCount === 1) {
    if (building.type === 'palace') return `One ${role} is present near the outer approach.`;
    return `${conditions ? `${conditions}, ` : ''}one ${role} is close by, enough to make the ${place} feel occupied rather than crowded.`;
  }
  if (presentCount <= 3) return `${conditions ? `${conditions}, ` : ''}a few people are present, giving the ${place} a steady but unhurried rhythm.`;
  return `${conditions ? `${conditions}, ` : ''}several people are present, and the ${place} feels busy.`;
}

function nearestImportantBuildings(building: Building, buildings: Building[]): NearbyBuilding[] {
  return buildings
    .filter((candidate) => candidate.id !== building.id && IMPORTANT_TYPES.has(candidate.type))
    .map((candidate) => ({ building: candidate, distance: distance2d(building.position, candidate.position) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 8);
}

function nearestOf(nearby: NearbyBuilding[], types: Set<BuildingType>, excludeId?: string): NearbyBuilding | undefined {
  return nearby.find((entry) => entry.building.id !== excludeId && types.has(entry.building.type));
}

function nearestSemanticNeighbor(building: Building, nearby: NearbyBuilding[], types: Set<BuildingType>): NearbyBuilding | undefined {
  return nearby.find((entry) => entry.building.id !== building.id && types.has(entry.building.type) && semanticCompatible(building, entry.building));
}

function semanticCompatible(source: Building, target: Building): boolean {
  const sourceKind = source.labelEyebrow?.toLowerCase();
  if (sourceKind === 'religious' || source.type === 'spiritual') {
    return target.type === 'spiritual' || target.labelEyebrow?.toLowerCase() === 'religious' || target.type === 'palace' || target.type === 'plaza' || target.type === 'house' || target.type === 'estate';
  }
  if (sourceKind === 'civic' || source.type === 'fort') {
    return target.type === 'fort' || target.type === 'palace' || target.type === 'plaza' || target.type === 'dock' || target.type === 'warehouse' || target.type === 'market';
  }
  return true;
}

function activityNeighbor(building: Building, nearby: NearbyBuilding[]): NearbyBuilding | undefined {
  if (building.labelEyebrow?.toLowerCase() === 'religious' || building.type === 'spiritual') {
    return nearby.find((entry) => entry.building.type === 'spiritual' || entry.building.type === 'plaza' || entry.building.type === 'palace' || entry.building.type === 'house' || entry.building.type === 'estate');
  }
  if (building.type === 'dock' || building.type === 'warehouse' || building.type === 'market') {
    return nearby.find((entry) => COMMERCIAL_TYPES.has(entry.building.type));
  }
  return nearby[0];
}

function distance2d(a: [number, number, number], b: [number, number, number]): number {
  const dx = a[0] - b[0];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dz * dz);
}

function distanceHerePhrase(distance: number): string {
  if (distance < 18) return 'just beside it';
  if (distance < 36) return 'a short walk away';
  if (distance < 70) return 'nearby';
  return 'farther off';
}

function distanceFromPhrase(distance: number): string {
  if (distance < 18) return 'beside';
  if (distance < 36) return 'a short walk from';
  if (distance < 70) return 'near';
  return 'some distance from';
}

function portRing(distance: number, scale: Port['scale']): string {
  const radius = scale === 'Huge' ? 150 : scale === 'Very Large' ? 125 : scale === 'Large' ? 105 : scale === 'Medium' ? 82 : 62;
  const ratio = distance / radius;
  if (ratio < 0.33) return 'inner town';
  if (ratio < 0.72) return 'middle town';
  return 'outer town';
}

function buildingName(building: Building): string {
  return building.label ?? TYPE_NOUN[building.type];
}

function districtPhrase(building: Building): string {
  if (!building.district) return 'in an unmarked quarter';
  const label = DISTRICT_LABELS[building.district].toLowerCase();
  if (building.district === 'waterside') return 'on the waterside';
  if (building.district === 'fringe') return 'on the town fringe';
  if (building.district === 'urban-core') return 'in the urban core';
  return `in the ${label} quarter`;
}

function landmarkNote(building: Building): LandmarkNote | undefined {
  return building.landmarkId ? LANDMARK_DESCRIPTION_NOTES[building.landmarkId] : undefined;
}

function gatheringPlacePhrase(building: Building): string {
  if (building.type === 'landmark') {
    if (building.landmarkId?.includes('tower') || building.landmarkId?.includes('spire') || building.landmarkId?.includes('campanile')) return 'at its base';
    if (building.labelEyebrow?.toLowerCase() === 'religious') return 'near the entrance';
  }
  if (building.type === 'dock') return 'along the quay';
  if (building.type === 'warehouse') return 'by the storehouse doors';
  if (building.type === 'market' || building.type === 'plaza') return 'in the open space';
  return 'at the threshold';
}

function timeContext(timeOfDay: number): { period: 'night' | 'morning' | 'afternoon' | 'evening'; opener: string } {
  const hour = ((timeOfDay % 24) + 24) % 24;
  if (hour < 5 || hour >= 21) return { period: 'night', opener: 'At this hour of night' };
  if (hour < 11) return { period: 'morning', opener: 'In the morning light' };
  if (hour < 17) return { period: 'afternoon', opener: 'Under the afternoon sun' };
  return { period: 'evening', opener: 'In the evening light' };
}

function weatherContext(weather: WeatherState): { wet: boolean; opener: string | undefined } {
  if (weather.kind !== 'rain' || Math.max(weather.intensity, weather.targetIntensity) < 0.18) return { wet: false, opener: undefined };
  const intensity = Math.max(weather.intensity, weather.targetIntensity);
  if (intensity > 0.72) return { wet: true, opener: 'In the heavy rain' };
  if (intensity > 0.42) return { wet: true, opener: 'In the rain' };
  return { wet: true, opener: 'In the drizzle' };
}

function conditionPhrase(weather: string | undefined, time: string | undefined): string {
  if (weather && time) return `${weather}, ${time.charAt(0).toLowerCase()}${time.slice(1)}`;
  return weather ?? time ?? '';
}

function semanticKind(building: Building): string {
  const eyebrow = building.labelEyebrow?.toLowerCase();
  if (eyebrow) return eyebrow;
  return TYPE_NOUN[building.type];
}

function faithLabel(faith?: string): string {
  if (!faith) return 'a local';
  if (faith === 'chinese-folk') return 'a Chinese folk';
  return `a ${faith.replace(/-/g, ' ')}`;
}

function cropLabel(crop: NonNullable<Building['crop']>): string {
  if (crop === 'rice') return 'rice plots';
  if (crop === 'date') return 'date palms';
  if (crop === 'palm') return 'palms';
  if (crop === 'grain') return 'grain plots';
  return `${crop} plots`;
}

function article(noun: string): string {
  return /^[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`;
}

function landmarkArticle(kind: string): string {
  return /^[aeiou]/i.test(kind) ? `an ${kind}` : `a ${kind}`;
}
