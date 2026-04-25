import type { Port } from '../store/gameStore';
import { placeHinterlandScenes, type SceneKind } from './hinterlandScenes';

export type AmbientSourceKind =
  | SceneKind
  | 'port-approach';

export interface AmbientSource {
  id: string;
  kind: AmbientSourceKind;
  x: number;
  z: number;
  radius: number;
  lines: string[];
  color: string;
}

const HINTERLAND_RADIUS = 16;
const PORT_RADIUS = 70;

const COLORS: Record<AmbientSourceKind, string> = {
  'shepherds-fire':  '#e8c590',
  'coffee-mat':      '#e0b478',
  'charcoal-mound':  '#c89870',
  'palm-wine-bench': '#d8b878',
  'roadside-shrine': '#d8c08c',
  'cattle-trough':   '#c4b088',
  'port-approach':   '#e6cc88',
};

const LINES: Record<AmbientSourceKind, string[]> = {
  'shepherds-fire': [
    'The fire crackles…',
    'Embers drift on the night air.',
    'A soft bleat from the dark.',
    'Wool and woodsmoke.',
  ],
  'coffee-mat': [
    'Voices murmur over coffee.',
    'Steam rises from a copper pot.',
    'Cardamom on the breeze.',
    'Someone laughs, low.',
  ],
  'charcoal-mound': [
    'The kiln smolders quietly.',
    'Pinewood ash, warm underfoot.',
    'A thin column of smoke.',
  ],
  'palm-wine-bench': [
    'Laughter, low and easy.',
    'The gourd passes hand to hand.',
    'Cicadas, somewhere close.',
  ],
  'roadside-shrine': [
    'Incense, faint on the breeze.',
    'Marigold petals at your feet.',
    'A bell, struck once.',
  ],
  'cattle-trough': [
    'Hooves shift in the dust.',
    'The trough water is still.',
    'A long, slow breath in the dark.',
  ],
  'port-approach': [
    'Lanterns glimmer along the quay.',
    'Voices in three languages.',
    'Tar and rope and brine.',
    'A bell tolls from the harbor.',
  ],
};

export function buildAmbientSources(ports: Port[], worldSeed: number): AmbientSource[] {
  const out: AmbientSource[] = [];
  if (ports.length === 0) return out;

  const port = ports[0];
  out.push({
    id: `port-${port.name}`,
    kind: 'port-approach',
    x: port.position[0],
    z: port.position[2],
    radius: PORT_RADIUS,
    lines: LINES['port-approach'],
    color: COLORS['port-approach'],
  });

  const scenes = placeHinterlandScenes(
    port.position[0], port.position[2],
    port.culture, port.buildings, worldSeed,
  );
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    out.push({
      id: `${s.kind}-${i}`,
      kind: s.kind,
      x: s.x,
      z: s.z,
      radius: HINTERLAND_RADIUS,
      lines: LINES[s.kind],
      color: COLORS[s.kind],
    });
  }
  return out;
}

export function pickLine(source: AmbientSource, seed: number): string {
  const idx = Math.abs(Math.floor(seed)) % source.lines.length;
  return source.lines[idx];
}
