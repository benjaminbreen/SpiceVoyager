// Synthesized UI sound effects — no audio files needed.
// Inspired by Diablo 2's minimalist, tactile menu sounds.

import { getActivePlayerPos } from '../utils/livePlayerTransform';

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/**
 * Build a gain+panner chain terminating at ac.destination, biased by the XZ
 * offset from the active player. Sound falls off with distance and pans
 * left/right using world-space dx — matches the camera's near-overhead view
 * accurately enough without tracking camera rotation.
 *
 * Returns the chain's *input* node, suitable for passing as the `dest`
 * parameter to noise()/ping() or as the terminus of caller-built chains.
 */
function spatialDest(ac: AudioContext, x: number, z: number): AudioNode {
  const pp = getActivePlayerPos();
  const dx = x - pp[0];
  const dz = z - pp[2];
  const dist = Math.sqrt(dx * dx + dz * dz);
  // 1/(1+d/r) falloff: half volume at distance = ATTEN_RANGE
  const ATTEN_RANGE = 32;
  const atten = ATTEN_RANGE / (ATTEN_RANGE + dist);
  // Pan saturates before going off-screen so hard left/right happens at ~20u
  const PAN_RANGE = 20;
  const panVal = Math.max(-1, Math.min(1, dx / PAN_RANGE));

  const gain = ac.createGain();
  gain.gain.value = atten;
  const pan = ac.createStereoPanner();
  pan.pan.value = panVal;
  gain.connect(pan).connect(ac.destination);
  return gain;
}

/** Short noise burst shaped by an envelope — foundation for clicks. */
function noise(
  ac: AudioContext,
  duration: number,
  volume: number,
  filterFreq: number,
  filterQ: number,
  dest: AudioNode = ac.destination,
) {
  const len = ac.sampleRate * duration;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

  const src = ac.createBufferSource();
  src.buffer = buf;

  const filt = ac.createBiquadFilter();
  filt.type = 'bandpass';
  filt.frequency.value = filterFreq;
  filt.Q.value = filterQ;

  const gain = ac.createGain();
  const t = ac.currentTime;
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

  src.connect(filt).connect(gain).connect(dest);
  src.start(t);
  src.stop(t + duration);
}

/** Short tonal ping — adds character to the noise layer. */
function ping(
  ac: AudioContext,
  freq: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine',
  dest: AudioNode = ac.destination,
) {
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;

  const gain = ac.createGain();
  const t = ac.currentTime;
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

  osc.connect(gain).connect(dest);
  osc.start(t);
  osc.stop(t + duration);
}

// ── Tab ambient state ──────────────────────────────────────

type TabAmbientNodes = {
  sources: AudioBufferSourceNode[];
  oscillators: OscillatorNode[];
  masterGain: GainNode;
};

let activeTabAmbient: TabAmbientNodes | null = null;
let activeTabType: string | null = null;

function stopTabAmbient(fadeTime = 0.4) {
  if (!activeTabAmbient || !ctx) return;
  const t = ctx.currentTime;
  activeTabAmbient.masterGain.gain.setValueAtTime(activeTabAmbient.masterGain.gain.value, t);
  activeTabAmbient.masterGain.gain.linearRampToValueAtTime(0, t + fadeTime);
  const nodes = activeTabAmbient;
  setTimeout(() => {
    nodes.sources.forEach(s => { try { s.stop(); } catch {} });
    nodes.oscillators.forEach(o => { try { o.stop(); } catch {} });
    nodes.masterGain.disconnect();
  }, fadeTime * 1000 + 50);
  activeTabAmbient = null;
  activeTabType = null;
}

function createLoopingNoise(ac: AudioContext, duration: number): AudioBufferSourceNode {
  const len = ac.sampleRate * duration;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  return src;
}

function startMarketAmbient(ac: AudioContext, master: GainNode) {
  const sources: AudioBufferSourceNode[] = [];
  const oscillators: OscillatorNode[] = [];
  const t = ac.currentTime;

  // Crowd murmur — the body of voices, warm and present
  const crowd = createLoopingNoise(ac, 2);
  const crowdFilt = ac.createBiquadFilter();
  crowdFilt.type = 'bandpass';
  crowdFilt.frequency.value = 400;
  crowdFilt.Q.value = 2;
  const crowdGain = ac.createGain();
  crowdGain.gain.value = 0.45;
  const crowdLfo = ac.createOscillator();
  crowdLfo.type = 'sine';
  crowdLfo.frequency.value = 0.12;
  const crowdLfoGain = ac.createGain();
  crowdLfoGain.gain.value = 0.15;
  crowdLfo.connect(crowdLfoGain).connect(crowdGain.gain);
  crowdLfo.start(t);
  crowd.connect(crowdFilt).connect(crowdGain).connect(master);
  crowd.start(t);
  sources.push(crowd);
  oscillators.push(crowdLfo);

  // Chatter — brighter speech-like layer above the murmur
  const chatter = createLoopingNoise(ac, 1.5);
  const chatterFilt = ac.createBiquadFilter();
  chatterFilt.type = 'bandpass';
  chatterFilt.frequency.value = 850;
  chatterFilt.Q.value = 2.5;
  const chatterGain = ac.createGain();
  chatterGain.gain.value = 0.15;
  const chatterLfo = ac.createOscillator();
  chatterLfo.type = 'sine';
  chatterLfo.frequency.value = 0.22;
  const chatterLfoGain = ac.createGain();
  chatterLfoGain.gain.value = 0.08;
  chatterLfo.connect(chatterLfoGain).connect(chatterGain.gain);
  chatterLfo.start(t);
  chatter.connect(chatterFilt).connect(chatterGain).connect(master);
  chatter.start(t);
  sources.push(chatter);
  oscillators.push(chatterLfo);

  // Foot traffic — low rumble of movement, carts, shuffling
  const shuffle = createLoopingNoise(ac, 1);
  const shuffleFilt = ac.createBiquadFilter();
  shuffleFilt.type = 'lowpass';
  shuffleFilt.frequency.value = 220;
  const shuffleGain = ac.createGain();
  shuffleGain.gain.value = 0.12;
  // Slow pulsing so it feels like waves of foot traffic
  const shuffleLfo = ac.createOscillator();
  shuffleLfo.type = 'sine';
  shuffleLfo.frequency.value = 0.18;
  const shuffleLfoGain = ac.createGain();
  shuffleLfoGain.gain.value = 0.06;
  shuffleLfo.connect(shuffleLfoGain).connect(shuffleGain.gain);
  shuffleLfo.start(t);
  shuffle.connect(shuffleFilt).connect(shuffleGain).connect(master);
  shuffle.start(t);
  sources.push(shuffle);
  oscillators.push(shuffleLfo);

  return { sources, oscillators };
}

function startShipyardAmbient(ac: AudioContext, master: GainNode) {
  const sources: AudioBufferSourceNode[] = [];
  const oscillators: OscillatorNode[] = [];
  const t = ac.currentTime;

  // Hammering — sharp percussive hits, loud and rhythmic
  const hammer = createLoopingNoise(ac, 0.8);
  const hammerFilt = ac.createBiquadFilter();
  hammerFilt.type = 'bandpass';
  hammerFilt.frequency.value = 1400;
  hammerFilt.Q.value = 5;
  const hammerGain = ac.createGain();
  hammerGain.gain.value = 0.0;
  // Square LFO at ~2.3 Hz for a steady knock-knock-knock
  const hammerLfo = ac.createOscillator();
  hammerLfo.type = 'square';
  hammerLfo.frequency.value = 2.3;
  const hammerLfoGain = ac.createGain();
  hammerLfoGain.gain.value = 0.40;
  hammerLfo.connect(hammerLfoGain).connect(hammerGain.gain);
  hammerLfo.start(t);
  hammer.connect(hammerFilt).connect(hammerGain).connect(master);
  hammer.start(t);
  sources.push(hammer);
  oscillators.push(hammerLfo);

  // Sawing — back-and-forth raspy noise, the signature shipyard sound
  // Highpass noise with a sine LFO sweeping the filter frequency up and down
  const saw = createLoopingNoise(ac, 1.5);
  const sawFilt = ac.createBiquadFilter();
  sawFilt.type = 'bandpass';
  sawFilt.frequency.value = 2200;
  sawFilt.Q.value = 3;
  const sawGain = ac.createGain();
  sawGain.gain.value = 0.0;
  // Sine AM at ~1.4Hz — the back-and-forth stroke rhythm
  const sawLfo = ac.createOscillator();
  sawLfo.type = 'sine';
  sawLfo.frequency.value = 1.4;
  const sawLfoGain = ac.createGain();
  sawLfoGain.gain.value = 0.25;
  sawLfo.connect(sawLfoGain).connect(sawGain.gain);
  // Sweep the filter frequency with each stroke for the "bite" of the saw
  const sawSweep = ac.createOscillator();
  sawSweep.type = 'sine';
  sawSweep.frequency.value = 1.4;  // same rate as stroke
  const sawSweepGain = ac.createGain();
  sawSweepGain.gain.value = 600;   // sweeps ±600Hz around 2200
  sawSweep.connect(sawSweepGain).connect(sawFilt.frequency);
  // Slow gate so sawing comes and goes (not constant)
  const sawGate = ac.createOscillator();
  sawGate.type = 'sine';
  sawGate.frequency.value = 0.06;
  const sawGateGain = ac.createGain();
  sawGateGain.gain.value = 0.15;
  sawGate.connect(sawGateGain).connect(sawGain.gain);
  sawLfo.start(t); sawSweep.start(t); sawGate.start(t);
  saw.connect(sawFilt).connect(sawGain).connect(master);
  saw.start(t);
  sources.push(saw);
  oscillators.push(sawLfo, sawSweep, sawGate);

  // Water lapping — low filtered noise, slow swell
  const water = createLoopingNoise(ac, 3);
  const waterFilt = ac.createBiquadFilter();
  waterFilt.type = 'lowpass';
  waterFilt.frequency.value = 400;
  const waterGain = ac.createGain();
  waterGain.gain.value = 0.15;
  const waterLfo = ac.createOscillator();
  waterLfo.type = 'sine';
  waterLfo.frequency.value = 0.2;
  const waterLfoGain = ac.createGain();
  waterLfoGain.gain.value = 0.08;
  waterLfo.connect(waterLfoGain).connect(waterGain.gain);
  waterLfo.start(t);
  water.connect(waterFilt).connect(waterGain).connect(master);
  water.start(t);
  sources.push(water);
  oscillators.push(waterLfo);

  // Wood creaking — narrow resonant groan
  const creak = createLoopingNoise(ac, 2);
  const creakFilt = ac.createBiquadFilter();
  creakFilt.type = 'bandpass';
  creakFilt.frequency.value = 300;
  creakFilt.Q.value = 10;
  const creakGain = ac.createGain();
  creakGain.gain.value = 0.10;
  const creakLfo = ac.createOscillator();
  creakLfo.type = 'sine';
  creakLfo.frequency.value = 0.08;
  const creakLfoGain = ac.createGain();
  creakLfoGain.gain.value = 0.05;
  creakLfo.connect(creakLfoGain).connect(creakGain.gain);
  creakLfo.start(t);
  creak.connect(creakFilt).connect(creakGain).connect(master);
  creak.start(t);
  sources.push(creak);
  oscillators.push(creakLfo);

  return { sources, oscillators };
}

function startTavernAmbient(ac: AudioContext, master: GainNode) {
  const sources: AudioBufferSourceNode[] = [];
  const oscillators: OscillatorNode[] = [];
  const t = ac.currentTime;

  // Muffled crowd — lower, warmer than market
  const crowd = createLoopingNoise(ac, 2);
  const crowdFilt = ac.createBiquadFilter();
  crowdFilt.type = 'lowpass';
  crowdFilt.frequency.value = 350;
  const crowdGain = ac.createGain();
  crowdGain.gain.value = 0.2;
  const crowdLfo = ac.createOscillator();
  crowdLfo.type = 'sine';
  crowdLfo.frequency.value = 0.1;
  const crowdLfoGain = ac.createGain();
  crowdLfoGain.gain.value = 0.06;
  crowdLfo.connect(crowdLfoGain).connect(crowdGain.gain);
  crowdLfo.start(t);
  crowd.connect(crowdFilt).connect(crowdGain).connect(master);
  crowd.start(t);
  sources.push(crowd);
  oscillators.push(crowdLfo);

  // Warm drone — like a fire crackling, two low detuned tones
  const fire1 = ac.createOscillator();
  fire1.type = 'triangle';
  fire1.frequency.value = 85;
  const fire2 = ac.createOscillator();
  fire2.type = 'triangle';
  fire2.frequency.value = 127;
  const fireGain = ac.createGain();
  fireGain.gain.value = 0.04;
  fire1.connect(fireGain).connect(master);
  fire2.connect(fireGain);
  fire1.start(t);
  fire2.start(t);
  oscillators.push(fire1, fire2);

  return { sources, oscillators };
}

function startGovernorAmbient(ac: AudioContext, master: GainNode) {
  const sources: AudioBufferSourceNode[] = [];
  const oscillators: OscillatorNode[] = [];
  const t = ac.currentTime;

  // Near-silence — just a faint room tone
  const room = createLoopingNoise(ac, 3);
  const roomFilt = ac.createBiquadFilter();
  roomFilt.type = 'lowpass';
  roomFilt.frequency.value = 200;
  const roomGain = ac.createGain();
  roomGain.gain.value = 0.08;
  room.connect(roomFilt).connect(roomGain).connect(master);
  room.start(t);
  sources.push(room);

  // Distant quiet — barely audible tonal hum (candles, stone walls)
  const hum = ac.createOscillator();
  hum.type = 'sine';
  hum.frequency.value = 60;
  const humGain = ac.createGain();
  humGain.gain.value = 0.02;
  hum.connect(humGain).connect(master);
  hum.start(t);
  oscillators.push(hum);

  return { sources, oscillators };
}

// ── Regional climate ambient layers ─────────────────────────

const PORT_CLIMATE: Record<string, string> = {
  goa: 'tropical', hormuz: 'arid', malacca: 'tropical', aden: 'arid',
  zanzibar: 'tropical', macau: 'temperate', mombasa: 'monsoon',
  calicut: 'monsoon', surat: 'monsoon', muscat: 'arid',
  mocha: 'arid', bantam: 'tropical', socotra: 'arid', diu: 'arid',
};

type AmbientNodes = { sources: AudioBufferSourceNode[]; oscillators: OscillatorNode[] };

function createTropicalLayer(ac: AudioContext, master: GainNode): AmbientNodes {
  const sources: AudioBufferSourceNode[] = [];
  const oscillators: OscillatorNode[] = [];
  const t = ac.currentTime;

  // Humid air — warm low-frequency noise bed
  const humid = createLoopingNoise(ac, 2);
  const humidFilt = ac.createBiquadFilter();
  humidFilt.type = 'bandpass';
  humidFilt.frequency.value = 250;
  humidFilt.Q.value = 0.6;
  const humidGain = ac.createGain();
  humidGain.gain.value = 0.035;
  humid.connect(humidFilt).connect(humidGain).connect(master);
  humid.start(t);
  sources.push(humid);

  return { sources, oscillators };
}

function createAridLayer(ac: AudioContext, master: GainNode): AmbientNodes {
  const sources: AudioBufferSourceNode[] = [];
  const oscillators: OscillatorNode[] = [];
  const t = ac.currentTime;

  // Dry wind gusts — highpass noise with slow swell
  const wind = createLoopingNoise(ac, 3);
  const windFilt = ac.createBiquadFilter();
  windFilt.type = 'highpass';
  windFilt.frequency.value = 1500;
  const windGain = ac.createGain();
  windGain.gain.value = 0.03;
  const windLfo = ac.createOscillator();
  windLfo.type = 'sine';
  windLfo.frequency.value = 0.06;
  const windLfoGain = ac.createGain();
  windLfoGain.gain.value = 0.025;
  windLfo.connect(windLfoGain).connect(windGain.gain);
  windLfo.start(t);
  wind.connect(windFilt).connect(windGain).connect(master);
  wind.start(t);
  sources.push(wind);
  oscillators.push(windLfo);

  return { sources, oscillators };
}

function createMonsoonLayer(ac: AudioContext, master: GainNode): AmbientNodes {
  const sources: AudioBufferSourceNode[] = [];
  const oscillators: OscillatorNode[] = [];
  const t = ac.currentTime;

  // Rain — gentle highpass noise, subtle enough to not sound like static
  const rain = createLoopingNoise(ac, 2);
  const rainFilt = ac.createBiquadFilter();
  rainFilt.type = 'highpass';
  rainFilt.frequency.value = 6000;
  const rainGain = ac.createGain();
  rainGain.gain.value = 0.018;
  const rainLfo = ac.createOscillator();
  rainLfo.type = 'sine';
  rainLfo.frequency.value = 0.04;
  const rainLfoGain = ac.createGain();
  rainLfoGain.gain.value = 0.01;
  rainLfo.connect(rainLfoGain).connect(rainGain.gain);
  rainLfo.start(t);
  rain.connect(rainFilt).connect(rainGain).connect(master);
  rain.start(t);
  sources.push(rain);
  oscillators.push(rainLfo);

  // Water runoff — lower bandpass texture, gentle dripping feel
  const runoff = createLoopingNoise(ac, 3);
  const runoffFilt = ac.createBiquadFilter();
  runoffFilt.type = 'bandpass';
  runoffFilt.frequency.value = 500;
  runoffFilt.Q.value = 1.5;
  const runoffGain = ac.createGain();
  runoffGain.gain.value = 0.012;
  runoff.connect(runoffFilt).connect(runoffGain).connect(master);
  runoff.start(t);
  sources.push(runoff);

  return { sources, oscillators };
}

function createTemperateLayer(ac: AudioContext, master: GainNode): AmbientNodes {
  const sources: AudioBufferSourceNode[] = [];
  const oscillators: OscillatorNode[] = [];
  const t = ac.currentTime;

  // Light breeze — gentle lowpass noise
  const breeze = createLoopingNoise(ac, 3);
  const breezeFilt = ac.createBiquadFilter();
  breezeFilt.type = 'lowpass';
  breezeFilt.frequency.value = 800;
  const breezeGain = ac.createGain();
  breezeGain.gain.value = 0.025;
  const breezeLfo = ac.createOscillator();
  breezeLfo.type = 'sine';
  breezeLfo.frequency.value = 0.08;
  const breezeLfoGain = ac.createGain();
  breezeLfoGain.gain.value = 0.015;
  breezeLfo.connect(breezeLfoGain).connect(breezeGain.gain);
  breezeLfo.start(t);
  breeze.connect(breezeFilt).connect(breezeGain).connect(master);
  breeze.start(t);
  sources.push(breeze);
  oscillators.push(breezeLfo);

  return { sources, oscillators };
}

function mergeAmbientNodes(a: AmbientNodes, b: AmbientNodes): AmbientNodes {
  return {
    sources: [...a.sources, ...b.sources],
    oscillators: [...a.oscillators, ...b.oscillators],
  };
}

/** Start ambient loop for a port modal tab. Stops any currently playing tab ambient.
 *  If portId is provided, a subtle regional climate layer is mixed in. */
export function startTabAmbient(tab: string, portId?: string) {
  if (tab === activeTabType) return; // already playing
  stopTabAmbient(0.3);

  const ac = getCtx();
  const master = ac.createGain();
  const v = masterVolume * 0.25;
  master.gain.setValueAtTime(0, ac.currentTime);
  master.gain.linearRampToValueAtTime(v, ac.currentTime + 0.5);
  master.connect(ac.destination);

  let nodes: AmbientNodes;
  switch (tab) {
    case 'market':   nodes = startMarketAmbient(ac, master); break;
    case 'shipyard': nodes = startShipyardAmbient(ac, master); break;
    case 'tavern':   nodes = startTavernAmbient(ac, master); break;
    case 'governor': nodes = startGovernorAmbient(ac, master); break;
    default:         nodes = { sources: [], oscillators: [] }; break;
  }

  // Mix in regional climate undertone
  if (portId) {
    const climate = PORT_CLIMATE[portId];
    let climateNodes: AmbientNodes = { sources: [], oscillators: [] };
    switch (climate) {
      case 'tropical':  climateNodes = createTropicalLayer(ac, master); break;
      case 'arid':      climateNodes = createAridLayer(ac, master); break;
      case 'monsoon':   climateNodes = createMonsoonLayer(ac, master); break;
      case 'temperate': climateNodes = createTemperateLayer(ac, master); break;
    }
    nodes = mergeAmbientNodes(nodes, climateNodes);
  }

  activeTabAmbient = { ...nodes, masterGain: master };
  activeTabType = tab;
}

/** Stop the current tab ambient (called when closing the port modal). */
export function stopTabAmbientLoop() {
  stopTabAmbient(0.6);
}

// ── Public API ──────────────────────────────────────────────

let masterVolume = 0.5;

export function setSfxVolume(v: number) {
  masterVolume = Math.max(0, Math.min(1, v));
}

export function getSfxVolume() {
  return masterVolume;
}

/** Soft stone/metal tap — main button click. */
export function sfxClick() {
  const ac = getCtx();
  const v = masterVolume * 0.35;
  noise(ac, 0.06, v, 3200, 1.5);
  ping(ac, 1800, 0.04, v * 0.4);
  ping(ac, 900, 0.05, v * 0.25);
}

/** Barely-there hover whisper. */
export function sfxHover() {
  const ac = getCtx();
  const v = masterVolume * 0.1;
  noise(ac, 0.03, v, 4000, 2);
}

/** Lighter click for tab switches. */
export function sfxTab() {
  const ac = getCtx();
  const v = masterVolume * 0.3;
  noise(ac, 0.045, v, 3800, 2);
  ping(ac, 2200, 0.03, v * 0.3);
}

// ── Collectible click variants ──────────────────────────────

/** Wet splash click — for fish, whales, aquatic collectibles. */
export function sfxClickSplash() {
  const ac = getCtx();
  const v = masterVolume * 0.3;
  const t = ac.currentTime;
  // Quick water burst — lowpass noise with fast descending cutoff
  const len = ac.sampleRate * 0.07;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filt = ac.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.setValueAtTime(4000, t);
  filt.frequency.exponentialRampToValueAtTime(600, t + 0.06);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(v * 0.5, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  src.connect(filt).connect(gain).connect(ac.destination);
  src.start(t);
  src.stop(t + 0.07);
  // Wet bubble ping
  ping(ac, 500, 0.05, v * 0.25, 'sine');
  ping(ac, 750, 0.035, v * 0.12, 'triangle');
}

/** Sandy scrunch click — for crabs, shells, beach collectibles. */
export function sfxClickSand() {
  const ac = getCtx();
  const v = masterVolume * 0.3;
  // Gritty short burst — bandpass noise centered low-mid
  noise(ac, 0.045, v * 0.5, 1200, 1);
  // Dry tap
  ping(ac, 250, 0.03, v * 0.2, 'sine');
  // High grain scatter
  noise(ac, 0.02, v * 0.2, 5000, 3);
}

/** Leafy rustle click — for plants, herbs, bark, jungle items. */
export function sfxClickRustle() {
  const ac = getCtx();
  const v = masterVolume * 0.25;
  // Soft mid-high rustle
  noise(ac, 0.05, v * 0.4, 2200, 1.5);
  // Gentle woody tap underneath
  ping(ac, 180, 0.04, v * 0.15, 'triangle');
  noise(ac, 0.025, v * 0.15, 3800, 2.5);
}

/** Metallic coin clink for buy/sell — scales with gold amount. */
export function sfxCoin(amount = 0) {
  const ac = getCtx();
  const v = masterVolume * 0.3;
  const t = ac.currentTime;

  // Base coin shimmer — always plays
  ping(ac, 4200, 0.08, v * 0.5);
  ping(ac, 5600, 0.06, v * 0.35);
  noise(ac, 0.03, v * 0.2, 6000, 3);

  if (amount >= 50) {
    // Medium trade — extra trailing clinks
    ping(ac, 3100, 0.1, v * 0.25);
    ping(ac, 3800, 0.07, v * 0.15);
    // Second coin, slightly delayed
    setTimeout(() => {
      ping(ac, 4500, 0.06, v * 0.3);
      ping(ac, 5200, 0.05, v * 0.2);
    }, 60);
  }

  if (amount >= 150) {
    // Big trade — pouch thud + coin cascade
    // Low pouch-drop thud
    ping(ac, 120, 0.15, v * 0.35, 'sine');
    noise(ac, 0.08, v * 0.2, 900, 1.2);
    // Cascade of small clinks
    for (let i = 0; i < 3; i++) {
      const delay = 80 + i * 45;
      const freq = 3600 + Math.random() * 2000;
      const dur = 0.04 + Math.random() * 0.03;
      setTimeout(() => {
        ping(ac, freq, dur, v * 0.15);
      }, delay);
    }
  }
}

/** Low textured scrape — modal/panel opening. */
export function sfxOpen() {
  const ac = getCtx();
  const v = masterVolume * 0.25;
  noise(ac, 0.12, v, 800, 0.8);
  ping(ac, 200, 0.1, v * 0.3);
  ping(ac, 350, 0.08, v * 0.15, 'triangle');
}

/** Softer close — reverse energy of open. */
export function sfxClose() {
  const ac = getCtx();
  const v = masterVolume * 0.2;
  noise(ac, 0.08, v, 1200, 1);
  ping(ac, 400, 0.06, v * 0.2);
}

// ── Loot tier pickup sounds ─────────────────────────────────
// Three tiers sharing a pentatonic vocabulary (D major):
// normal = single bright ping, rare = two-note lift, legendary = full fanfare.

/** Standard item pickup — clean single chime. */
export function sfxPickupNormal() {
  const ac = getCtx();
  const v = masterVolume * 0.25;
  // Single clear D5 ping with a soft octave shimmer
  ping(ac, 587, 0.12, v * 0.5);
  ping(ac, 1174, 0.08, v * 0.12, 'triangle');
  noise(ac, 0.03, v * 0.08, 4000, 2);
}

/** Rare item pickup — two-note ascending lift, richer than normal. */
export function sfxPickupRare() {
  const ac = getCtx();
  const v = masterVolume * 0.3;
  const t = ac.currentTime;

  // D5 → A5, quick ascending pair
  const notes = [587, 880];
  for (let i = 0; i < notes.length; i++) {
    const start = t + i * 0.09;
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = notes[i];
    const g = ac.createGain();
    g.gain.setValueAtTime(0.001, start);
    g.gain.linearRampToValueAtTime(v * 0.45, start + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, start + 0.2);
    osc.connect(g).connect(ac.destination);
    osc.start(start);
    osc.stop(start + 0.25);

    // Shimmer octave
    const osc2 = ac.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = notes[i] * 2.003;
    const g2 = ac.createGain();
    g2.gain.setValueAtTime(0.001, start);
    g2.gain.linearRampToValueAtTime(v * 0.1, start + 0.015);
    g2.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
    osc2.connect(g2).connect(ac.destination);
    osc2.start(start);
    osc2.stop(start + 0.2);
  }
  noise(ac, 0.04, v * 0.1, 5000, 2);
}

/** Legendary item pickup — triumphant four-note fanfare with harmonic bloom. */
export function sfxPickupLegendary() {
  const ac = getCtx();
  const v = masterVolume * 0.4;
  const t = ac.currentTime;

  // D5 → F#5 → A5 → D6: full octave ascent, pentatonic
  const notes = [587, 740, 880, 1175];
  const delays = [0, 0.1, 0.2, 0.35];

  for (let i = 0; i < notes.length; i++) {
    const start = t + delays[i];
    const isLast = i === notes.length - 1;

    // Primary tone
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = notes[i];
    const g = ac.createGain();
    const dur = isLast ? 0.5 : 0.25;
    g.gain.setValueAtTime(0.001, start);
    g.gain.linearRampToValueAtTime(v * (isLast ? 0.55 : 0.4), start + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, start + dur);
    osc.connect(g).connect(ac.destination);
    osc.start(start);
    osc.stop(start + dur + 0.05);

    // Shimmer octave (louder on final note)
    const osc2 = ac.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = notes[i] * 2.005;
    const g2 = ac.createGain();
    g2.gain.setValueAtTime(0.001, start);
    g2.gain.linearRampToValueAtTime(v * (isLast ? 0.18 : 0.1), start + 0.015);
    g2.gain.exponentialRampToValueAtTime(0.001, start + dur * 0.85);
    osc2.connect(g2).connect(ac.destination);
    osc2.start(start);
    osc2.stop(start + dur);

    // Third harmony on the final note (major chord bloom: D6 + F#6 + A6)
    if (isLast) {
      const harmonics = [notes[i] * 1.26, notes[i] * 1.5]; // ~F#6, ~A6
      for (const freq of harmonics) {
        const oh = ac.createOscillator();
        oh.type = 'sine';
        oh.frequency.value = freq;
        const gh = ac.createGain();
        gh.gain.setValueAtTime(0.001, start + 0.05);
        gh.gain.linearRampToValueAtTime(v * 0.12, start + 0.1);
        gh.gain.exponentialRampToValueAtTime(0.001, start + 0.5);
        oh.connect(gh).connect(ac.destination);
        oh.start(start + 0.05);
        oh.stop(start + 0.55);
      }
    }
  }

  // Reverb-like shimmer tail
  noise(ac, 0.4, v * 0.06, 3500, 0.5);
}

/** Quick chitinous skitter + comedic pop — crab collection. */
export function sfxCrabCollect() {
  const ac = getCtx();
  const v = masterVolume * 0.35;
  const t = ac.currentTime;

  // Rapid skittering clicks — three short noise bursts
  for (let i = 0; i < 3; i++) {
    const len = ac.sampleRate * 0.02;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let j = 0; j < len; j++) data[j] = Math.random() * 2 - 1;

    const src = ac.createBufferSource();
    src.buffer = buf;
    const filt = ac.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = 4000 + i * 800;
    filt.Q.value = 3;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(v * 0.5, t + i * 0.035);
    gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.035 + 0.02);
    src.connect(filt).connect(gain).connect(ac.destination);
    src.start(t + i * 0.035);
    src.stop(t + i * 0.035 + 0.02);
  }

  // Satisfying little pop at the end
  ping(ac, 880, 0.08, v * 0.4);
  ping(ac, 1320, 0.06, v * 0.25);
}

/** Treasure find — coins clinking and a chest creak. For gold/cargo from the sea. */
export function sfxTreasureFind() {
  const ac = getCtx();
  const v = masterVolume * 0.3;
  const t = ac.currentTime;

  // Chest creak — low filtered noise sweep
  const creakLen = ac.sampleRate * 0.15;
  const creakBuf = ac.createBuffer(1, creakLen, ac.sampleRate);
  const creakData = creakBuf.getChannelData(0);
  for (let i = 0; i < creakLen; i++) creakData[i] = Math.random() * 2 - 1;
  const creakSrc = ac.createBufferSource();
  creakSrc.buffer = creakBuf;
  const creakFilt = ac.createBiquadFilter();
  creakFilt.type = 'bandpass';
  creakFilt.frequency.setValueAtTime(300, t);
  creakFilt.frequency.linearRampToValueAtTime(800, t + 0.12);
  creakFilt.Q.value = 5;
  const creakGain = ac.createGain();
  creakGain.gain.setValueAtTime(v * 0.3, t);
  creakGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  creakSrc.connect(creakFilt).connect(creakGain).connect(ac.destination);
  creakSrc.start(t);
  creakSrc.stop(t + 0.15);

  // Coin clinks — rapid metallic pings at varied pitches
  const coinFreqs = [3200, 3800, 4200, 3500, 4600];
  const coinDelays = [0.08, 0.13, 0.17, 0.22, 0.28];
  for (let i = 0; i < coinFreqs.length; i++) {
    const start = t + coinDelays[i];
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = coinFreqs[i] + (Math.random() - 0.5) * 200;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.001, start);
    g.gain.linearRampToValueAtTime(v * 0.25, start + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, start + 0.1);
    osc.connect(g).connect(ac.destination);
    osc.start(start);
    osc.stop(start + 0.12);

    // Metallic harmonic overtone
    const osc2 = ac.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = coinFreqs[i] * 2.4;
    const g2 = ac.createGain();
    g2.gain.setValueAtTime(0.001, start);
    g2.gain.linearRampToValueAtTime(v * 0.06, start + 0.005);
    g2.gain.exponentialRampToValueAtTime(0.001, start + 0.07);
    osc2.connect(g2).connect(ac.destination);
    osc2.start(start);
    osc2.stop(start + 0.08);
  }

  // Final satisfying ring — lower tone that sustains
  const ring = ac.createOscillator();
  ring.type = 'sine';
  ring.frequency.value = 1760; // A6
  const ringG = ac.createGain();
  ringG.gain.setValueAtTime(0.001, t + 0.3);
  ringG.gain.linearRampToValueAtTime(v * 0.2, t + 0.32);
  ringG.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
  ring.connect(ringG).connect(ac.destination);
  ring.start(t + 0.3);
  ring.stop(t + 0.75);
}

/** Ascending melodic chime — new port or item discovered. */
export function sfxDiscovery() {
  const ac = getCtx();
  const v = masterVolume * 0.3;
  const t = ac.currentTime;

  // Three-note ascending motif (pentatonic: D5 → F#5 → A5)
  const notes = [587, 740, 880];
  const delays = [0, 0.1, 0.2];

  for (let i = 0; i < notes.length; i++) {
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = notes[i];

    // Add subtle shimmer with a second detuned oscillator
    const osc2 = ac.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = notes[i] * 2.005; // octave + slight detune

    const gain = ac.createGain();
    const start = t + delays[i];
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.linearRampToValueAtTime(v * 0.4, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);

    const gain2 = ac.createGain();
    gain2.gain.setValueAtTime(0.001, start);
    gain2.gain.linearRampToValueAtTime(v * 0.12, start + 0.02);
    gain2.gain.exponentialRampToValueAtTime(0.001, start + 0.3);

    osc.connect(gain).connect(ac.destination);
    osc2.connect(gain2).connect(ac.destination);
    osc.start(start);
    osc.stop(start + 0.4);
    osc2.start(start);
    osc2.stop(start + 0.35);
  }

  // Soft reverb-like tail — filtered noise shimmer
  noise(ac, 0.3, v * 0.08, 3000, 0.5);
}

/** Boots hitting sand/wood + rope creak — disembarking from ship. */
export function sfxDisembark() {
  const ac = getCtx();
  const v = masterVolume * 0.35;
  const t = ac.currentTime;

  // Rope creak — low filtered noise with slow attack
  const creakLen = ac.sampleRate * 0.15;
  const creakBuf = ac.createBuffer(1, creakLen, ac.sampleRate);
  const creakData = creakBuf.getChannelData(0);
  for (let i = 0; i < creakLen; i++) creakData[i] = Math.random() * 2 - 1;
  const creakSrc = ac.createBufferSource();
  creakSrc.buffer = creakBuf;
  const creakFilt = ac.createBiquadFilter();
  creakFilt.type = 'bandpass';
  creakFilt.frequency.value = 350;
  creakFilt.Q.value = 4;
  const creakGain = ac.createGain();
  creakGain.gain.setValueAtTime(0.001, t);
  creakGain.gain.linearRampToValueAtTime(v * 0.3, t + 0.05);
  creakGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  creakSrc.connect(creakFilt).connect(creakGain).connect(ac.destination);
  creakSrc.start(t);
  creakSrc.stop(t + 0.15);

  // Splash — brief wide-band noise, descending filter
  const splashLen = ac.sampleRate * 0.12;
  const splashBuf = ac.createBuffer(1, splashLen, ac.sampleRate);
  const splashData = splashBuf.getChannelData(0);
  for (let i = 0; i < splashLen; i++) splashData[i] = Math.random() * 2 - 1;
  const splashSrc = ac.createBufferSource();
  splashSrc.buffer = splashBuf;
  const splashFilt = ac.createBiquadFilter();
  splashFilt.type = 'lowpass';
  splashFilt.frequency.setValueAtTime(3000, t + 0.08);
  splashFilt.frequency.exponentialRampToValueAtTime(400, t + 0.2);
  const splashGain = ac.createGain();
  splashGain.gain.setValueAtTime(v * 0.3, t + 0.08);
  splashGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  splashSrc.connect(splashFilt).connect(splashGain).connect(ac.destination);
  splashSrc.start(t + 0.08);
  splashSrc.stop(t + 0.2);

  // Boot thud on land — low thump after the splash
  ping(ac, 90, 0.12, v * 0.4, 'sine');
  // Grit/sand texture
  noise(ac, 0.06, v * 0.15, 1800, 1.5);
}

/** Soft "denied" cue — shore is too steep to disembark. Low thud + descending nasal tone. */
export function sfxDisembarkBlocked() {
  const ac = getCtx();
  const v = masterVolume * 0.3;
  const t = ac.currentTime;

  // Dull hull-bump thud
  ping(ac, 95, 0.14, v * 0.5, 'sine');
  noise(ac, 0.08, v * 0.2, 600, 1.2);

  // Descending nasal "nope" — two short falling tones
  const osc = ac.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(420, t + 0.05);
  osc.frequency.exponentialRampToValueAtTime(260, t + 0.28);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t + 0.05);
  g.gain.linearRampToValueAtTime(v * 0.35, t + 0.08);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  osc.connect(g).connect(ac.destination);
  osc.start(t + 0.05);
  osc.stop(t + 0.32);
}

/** Rope taut + wood creak + water lap — embarking back onto ship. */
export function sfxEmbark() {
  const ac = getCtx();
  const v = masterVolume * 0.35;
  const t = ac.currentTime;

  // Footstep on wood — sharper attack than disembark's sand thud
  noise(ac, 0.04, v * 0.3, 2200, 2);
  ping(ac, 150, 0.08, v * 0.3, 'sine');

  // Rope pull — ascending filtered noise
  const ropeLen = ac.sampleRate * 0.2;
  const ropeBuf = ac.createBuffer(1, ropeLen, ac.sampleRate);
  const ropeData = ropeBuf.getChannelData(0);
  for (let i = 0; i < ropeLen; i++) ropeData[i] = Math.random() * 2 - 1;
  const ropeSrc = ac.createBufferSource();
  ropeSrc.buffer = ropeBuf;
  const ropeFilt = ac.createBiquadFilter();
  ropeFilt.type = 'bandpass';
  ropeFilt.frequency.setValueAtTime(250, t + 0.06);
  ropeFilt.frequency.exponentialRampToValueAtTime(600, t + 0.2);
  ropeFilt.Q.value = 5;
  const ropeGain = ac.createGain();
  ropeGain.gain.setValueAtTime(0.001, t + 0.06);
  ropeGain.gain.linearRampToValueAtTime(v * 0.25, t + 0.1);
  ropeGain.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
  ropeSrc.connect(ropeFilt).connect(ropeGain).connect(ac.destination);
  ropeSrc.start(t + 0.06);
  ropeSrc.stop(t + 0.26);

  // Hull settle — low resonant tone, like the ship taking weight
  const osc = ac.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(110, t + 0.15);
  osc.frequency.exponentialRampToValueAtTime(80, t + 0.45);
  const hullGain = ac.createGain();
  hullGain.gain.setValueAtTime(0.001, t + 0.15);
  hullGain.gain.linearRampToValueAtTime(v * 0.2, t + 0.2);
  hullGain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
  osc.connect(hullGain).connect(ac.destination);
  osc.start(t + 0.15);
  osc.stop(t + 0.5);
}

/** Biome-specific footstep — called in sync with walk cycle. */
export function sfxFootstep(biome: string) {
  const ac = getCtx();
  const v = masterVolume * 0.12; // subtle — these fire frequently

  switch (biome) {
    case 'beach':
    case 'desert':
    case 'scrubland':
      // Soft sand scrunch — muffled low noise
      noise(ac, 0.06, v, 800, 0.6);
      ping(ac, 100, 0.04, v * 0.3, 'sine');
      break;

    case 'paddy':
      // Wet squelch — shallow water splashing
      noise(ac, 0.05, v * 0.7, 1200, 0.8);
      ping(ac, 160, 0.03, v * 0.25, 'sine');
      break;

    case 'grassland':
    case 'swamp':
      // Soft rustle — mid-frequency with gentle attack
      noise(ac, 0.05, v * 0.8, 1600, 1.2);
      ping(ac, 200, 0.03, v * 0.15, 'triangle');
      break;

    case 'forest':
    case 'jungle':
      // Leaf/twig snap — sharper, with crunch
      noise(ac, 0.04, v, 2400, 2);
      ping(ac, 300, 0.03, v * 0.2, 'sine');
      // Tiny twig snap
      noise(ac, 0.015, v * 0.5, 4500, 4);
      break;

    case 'arroyo':
    case 'volcano':
      // Rocky gravel — bright, gritty
      noise(ac, 0.035, v, 3200, 2.5);
      ping(ac, 250, 0.025, v * 0.2, 'triangle');
      noise(ac, 0.02, v * 0.4, 5000, 3);
      break;

    case 'snow':
      // Soft crunch — quiet, compressed
      noise(ac, 0.07, v * 0.7, 1200, 0.8);
      ping(ac, 80, 0.05, v * 0.2, 'sine');
      break;

    default:
      // Generic stone/dock — sharp tap
      noise(ac, 0.03, v * 0.9, 2800, 2);
      ping(ac, 180, 0.03, v * 0.25, 'sine');
      break;
  }
}

/** Walking player bumping a tree trunk or rock — short woody thud. */
export function sfxThud() {
  const ac = getCtx();
  const v = masterVolume * 0.35;
  const t = ac.currentTime;

  // Low body — hollow trunk resonance
  ping(ac, 110, 0.09, v * 0.55, 'sine');
  ping(ac, 165, 0.07, v * 0.3, 'triangle');
  // Sharp attack — bark/wood contact transient
  noise(ac, 0.04, v * 0.4, 1800, 1.4);
  // Subtle tail — fades the impact rather than a clean cut
  const tail = ac.createGain();
  tail.gain.setValueAtTime(v * 0.12, t);
  tail.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  const tailOsc = ac.createOscillator();
  tailOsc.type = 'sine';
  tailOsc.frequency.value = 80;
  tailOsc.connect(tail).connect(ac.destination);
  tailOsc.start(t);
  tailOsc.stop(t + 0.12);
}

/** Ship grinding into shore — wood splintering on rock/sand. */
export function sfxShoreCollision() {
  const ac = getCtx();
  const v = masterVolume * 0.45;
  const t = ac.currentTime;

  // Deep hull impact — heavy low thud
  ping(ac, 60, 0.3, v * 0.6, 'sine');
  ping(ac, 95, 0.25, v * 0.4, 'triangle');

  // Wood splintering — mid-band noise with sharp attack
  noise(ac, 0.15, v * 0.5, 1400, 1.8);

  // Grinding scrape — narrow bandpass sweeping up (hull dragging on rock)
  const scrapeLen = ac.sampleRate * 0.3;
  const scrapeBuf = ac.createBuffer(1, scrapeLen, ac.sampleRate);
  const scrapeData = scrapeBuf.getChannelData(0);
  for (let i = 0; i < scrapeLen; i++) scrapeData[i] = Math.random() * 2 - 1;
  const scrapeSrc = ac.createBufferSource();
  scrapeSrc.buffer = scrapeBuf;
  const scrapeFilt = ac.createBiquadFilter();
  scrapeFilt.type = 'bandpass';
  scrapeFilt.frequency.setValueAtTime(300, t);
  scrapeFilt.frequency.exponentialRampToValueAtTime(900, t + 0.3);
  scrapeFilt.Q.value = 3;
  const scrapeGain = ac.createGain();
  scrapeGain.gain.setValueAtTime(v * 0.3, t);
  scrapeGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  scrapeSrc.connect(scrapeFilt).connect(scrapeGain).connect(ac.destination);
  scrapeSrc.start(t);
  scrapeSrc.stop(t + 0.3);

  // Spray/splash on impact
  noise(ac, 0.1, v * 0.2, 4000, 1.5);
}

/** Ship-to-ship collision — wood-on-wood crack + rigging clatter. */
export function sfxShipCollision() {
  const ac = getCtx();
  const v = masterVolume * 0.45;
  const t = ac.currentTime;

  // Sharp wood-on-wood crack — brighter and snappier than shore
  noise(ac, 0.06, v * 0.6, 2200, 2.5);
  ping(ac, 140, 0.15, v * 0.5, 'sine');
  ping(ac, 210, 0.12, v * 0.3, 'triangle');

  // Rigging clatter — rapid high metallic pings (chains, fittings)
  const clatterFreqs = [3200, 4100, 3700, 4800];
  for (let i = 0; i < clatterFreqs.length; i++) {
    const delay = 0.04 + i * 0.03;
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = clatterFreqs[i];
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.001, t + delay);
    gain.gain.linearRampToValueAtTime(v * 0.12, t + delay + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.06);
    osc.connect(gain).connect(ac.destination);
    osc.start(t + delay);
    osc.stop(t + delay + 0.06);
  }

  // Hull stress groan — low descending tone
  const groan = ac.createOscillator();
  groan.type = 'triangle';
  groan.frequency.setValueAtTime(120, t + 0.08);
  groan.frequency.exponentialRampToValueAtTime(70, t + 0.35);
  const groanGain = ac.createGain();
  groanGain.gain.setValueAtTime(0.001, t + 0.08);
  groanGain.gain.linearRampToValueAtTime(v * 0.25, t + 0.12);
  groanGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  groan.connect(groanGain).connect(ac.destination);
  groan.start(t + 0.08);
  groan.stop(t + 0.4);

  // Splash from both hulls displacing water
  noise(ac, 0.08, v * 0.15, 3500, 1);
}

/** Rope whoosh + net spreading + splash — casting a fishing net. */
export function sfxCastNet() {
  const ac = getCtx();
  const v = masterVolume * 0.35;
  const t = ac.currentTime;

  // Rope whoosh — ascending bandpass sweep (arm swinging the net)
  const whooshLen = ac.sampleRate * 0.25;
  const whooshBuf = ac.createBuffer(1, whooshLen, ac.sampleRate);
  const whooshData = whooshBuf.getChannelData(0);
  for (let i = 0; i < whooshLen; i++) whooshData[i] = Math.random() * 2 - 1;
  const whooshSrc = ac.createBufferSource();
  whooshSrc.buffer = whooshBuf;
  const whooshFilt = ac.createBiquadFilter();
  whooshFilt.type = 'bandpass';
  whooshFilt.frequency.setValueAtTime(400, t);
  whooshFilt.frequency.exponentialRampToValueAtTime(2000, t + 0.2);
  whooshFilt.Q.value = 1.5;
  const whooshGain = ac.createGain();
  whooshGain.gain.setValueAtTime(0.001, t);
  whooshGain.gain.linearRampToValueAtTime(v * 0.4, t + 0.08);
  whooshGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  whooshSrc.connect(whooshFilt).connect(whooshGain).connect(ac.destination);
  whooshSrc.start(t);
  whooshSrc.stop(t + 0.25);

  // Net spreading — brief high scatter (like beads/weights fanning out)
  for (let i = 0; i < 4; i++) {
    const delay = 0.15 + i * 0.03;
    const freq = 2800 + Math.random() * 1500;
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.001, t + delay);
    g.gain.linearRampToValueAtTime(v * 0.1, t + delay + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.04);
    osc.connect(g).connect(ac.destination);
    osc.start(t + delay);
    osc.stop(t + delay + 0.04);
  }

  // Splash on landing — descending lowpass burst
  const splashLen = ac.sampleRate * 0.15;
  const splashBuf = ac.createBuffer(1, splashLen, ac.sampleRate);
  const splashData = splashBuf.getChannelData(0);
  for (let i = 0; i < splashLen; i++) splashData[i] = Math.random() * 2 - 1;
  const splashSrc = ac.createBufferSource();
  splashSrc.buffer = splashBuf;
  const splashFilt = ac.createBiquadFilter();
  splashFilt.type = 'lowpass';
  splashFilt.frequency.setValueAtTime(3500, t + 0.28);
  splashFilt.frequency.exponentialRampToValueAtTime(300, t + 0.45);
  const splashGain = ac.createGain();
  splashGain.gain.setValueAtTime(v * 0.35, t + 0.28);
  splashGain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
  splashSrc.connect(splashFilt).connect(splashGain).connect(ac.destination);
  splashSrc.start(t + 0.28);
  splashSrc.stop(t + 0.45);
}

/** Wet rope pull + dripping + thud on deck — hauling in the net. */
export function sfxHaulNet() {
  const ac = getCtx();
  const v = masterVolume * 0.35;
  const t = ac.currentTime;

  // Wet rope pull — ascending narrow bandpass (straining under weight)
  const ropeLen = ac.sampleRate * 0.35;
  const ropeBuf = ac.createBuffer(1, ropeLen, ac.sampleRate);
  const ropeData = ropeBuf.getChannelData(0);
  for (let i = 0; i < ropeLen; i++) ropeData[i] = Math.random() * 2 - 1;
  const ropeSrc = ac.createBufferSource();
  ropeSrc.buffer = ropeBuf;
  const ropeFilt = ac.createBiquadFilter();
  ropeFilt.type = 'bandpass';
  ropeFilt.frequency.setValueAtTime(300, t);
  ropeFilt.frequency.exponentialRampToValueAtTime(700, t + 0.3);
  ropeFilt.Q.value = 4;
  const ropeGain = ac.createGain();
  ropeGain.gain.setValueAtTime(0.001, t);
  ropeGain.gain.linearRampToValueAtTime(v * 0.3, t + 0.05);
  ropeGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  ropeSrc.connect(ropeFilt).connect(ropeGain).connect(ac.destination);
  ropeSrc.start(t);
  ropeSrc.stop(t + 0.35);

  // Water dripping — quick high pings, staggered (water falling off net)
  for (let i = 0; i < 5; i++) {
    const delay = 0.2 + i * 0.06 + Math.random() * 0.03;
    const freq = 3000 + Math.random() * 2000;
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.001, t + delay);
    g.gain.linearRampToValueAtTime(v * 0.08, t + delay + 0.003);
    g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.05);
    osc.connect(g).connect(ac.destination);
    osc.start(t + delay);
    osc.stop(t + delay + 0.05);
  }

  // Thud on deck — the catch landing
  ping(ac, 100, 0.12, v * 0.3, 'sine');
  noise(ac, 0.05, v * 0.15, 1500, 1.5);
}

/** Deeper, resonant confirmation — "Set Sail" and major actions. */
export function sfxSail() {
  const ac = getCtx();
  const v = masterVolume * 0.4;
  // Low resonant boom
  ping(ac, 120, 0.25, v * 0.5, 'sine');
  ping(ac, 180, 0.2, v * 0.3, 'triangle');
  // Crisp attack layer
  noise(ac, 0.08, v * 0.4, 2000, 1);
  // High shimmer
  ping(ac, 1400, 0.15, v * 0.15);
  ping(ac, 2100, 0.12, v * 0.1);
}

/** Alert siren — descending two-tone alarm when entering fight mode. */
export function sfxBattleStations() {
  const ac = getCtx();
  const v = masterVolume * 0.35;
  const t = ac.currentTime;

  // Two-tone alarm: high → low, repeated twice
  for (let rep = 0; rep < 2; rep++) {
    const offset = rep * 0.35;

    // High tone
    const osc1 = ac.createOscillator();
    osc1.type = 'square';
    osc1.frequency.setValueAtTime(880, t + offset);
    osc1.frequency.linearRampToValueAtTime(660, t + offset + 0.15);
    const g1 = ac.createGain();
    g1.gain.setValueAtTime(v * 0.25, t + offset);
    g1.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.18);
    osc1.connect(g1).connect(ac.destination);
    osc1.start(t + offset);
    osc1.stop(t + offset + 0.2);

    // Low tone
    const osc2 = ac.createOscillator();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(440, t + offset + 0.15);
    osc2.frequency.linearRampToValueAtTime(330, t + offset + 0.3);
    const g2 = ac.createGain();
    g2.gain.setValueAtTime(v * 0.2, t + offset + 0.15);
    g2.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.35);
    osc2.connect(g2).connect(ac.destination);
    osc2.start(t + offset + 0.15);
    osc2.stop(t + offset + 0.38);
  }

  // Percussive hit under the alarm
  noise(ac, 0.1, v * 0.5, 600, 2);
}

/** Anchor splash — heavy chain rattle + water impact. */
export function sfxAnchorDrop() {
  const ac = getCtx();
  const v = masterVolume * 0.4;
  const t = ac.currentTime;

  // Heavy metallic clank — chain links
  for (let i = 0; i < 4; i++) {
    const delay = i * 0.06;
    const freq = 200 + Math.random() * 150;
    ping(ac, freq, 0.08, v * (0.3 - i * 0.05), 'triangle');
    noise(ac, 0.04, v * (0.2 - i * 0.03), 3000 + Math.random() * 1000, 3);
  }

  // Water splash impact (delayed)
  const splashBuf = ac.createBuffer(1, ac.sampleRate * 0.4, ac.sampleRate);
  const splashData = splashBuf.getChannelData(0);
  for (let i = 0; i < splashData.length; i++) splashData[i] = Math.random() * 2 - 1;
  const splash = ac.createBufferSource();
  splash.buffer = splashBuf;
  const lpf = ac.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.setValueAtTime(800, t + 0.25);
  lpf.frequency.exponentialRampToValueAtTime(200, t + 0.65);
  const sg = ac.createGain();
  sg.gain.setValueAtTime(0.001, t + 0.25);
  sg.gain.linearRampToValueAtTime(v * 0.3, t + 0.3);
  sg.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
  splash.connect(lpf).connect(sg).connect(ac.destination);
  splash.start(t + 0.25);
  splash.stop(t + 0.7);

  // Low thud
  ping(ac, 60, 0.3, v * 0.4, 'sine');
}

/** Bow wave — gentle wash of water at speed. One-shot, use with cooldown. */
export function sfxSailsCatch() {
  const ac = getCtx();
  const v = masterVolume * 0.12;
  const t = ac.currentTime;

  // Soft wash — long noise with slow fade-in, slow fade-out, low-passed
  const len = ac.sampleRate * 0.6;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const pos = i / len;
    // Gentle bell-curve envelope — no sharp attack
    const env = Math.sin(pos * Math.PI);
    data[i] = (Math.random() * 2 - 1) * env;
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1200, t);
  lp.frequency.exponentialRampToValueAtTime(400, t + 0.6);
  lp.Q.value = 0.3;
  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 100;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(v * 0.5, t + 0.15);
  g.gain.linearRampToValueAtTime(v * 0.3, t + 0.4);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
  src.connect(lp).connect(hp).connect(g).connect(ac.destination);
  src.start(t);
  src.stop(t + 0.6);
}

/** Turn wash — subtle water lapping as the hull turns. One-shot, use with cooldown. */
export function sfxRiggingCreak() {
  const ac = getCtx();
  const v = masterVolume * 0.10;
  const t = ac.currentTime;

  // Single soft wash — noise with gentle envelope, lowpass filtered
  const len = ac.sampleRate * 0.5;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const pos = i / len;
    // Slow rise, slow fall
    const env = Math.sin(pos * Math.PI) * (0.7 + 0.3 * Math.sin(pos * Math.PI * 3));
    data[i] = (Math.random() * 2 - 1) * env;
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(800, t);
  lp.frequency.exponentialRampToValueAtTime(300, t + 0.5);
  lp.Q.value = 0.3;
  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 80;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(v * 0.4, t + 0.12);
  g.gain.linearRampToValueAtTime(v * 0.25, t + 0.35);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  src.connect(lp).connect(hp).connect(g).connect(ac.destination);
  src.start(t);
  src.stop(t + 0.5);
}

/** Anchor weigh — chain hauling up + creak. */
/** Single broadside cannon report — deeper, heavier than swivel gun.
 *  Call once per cannon in a rolling broadside with ~150ms spacing. */
export function sfxBroadsideCannon() {
  const ac = getCtx();
  const v = masterVolume * 0.45;
  const t = ac.currentTime;

  // Deep boom — lower and longer than swivel
  const boom = ac.createOscillator();
  boom.type = 'sine';
  boom.frequency.setValueAtTime(55 + Math.random() * 15, t);
  boom.frequency.exponentialRampToValueAtTime(20, t + 0.6);
  const boomGain = ac.createGain();
  boomGain.gain.setValueAtTime(v, t);
  boomGain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
  boom.connect(boomGain).connect(ac.destination);
  boom.start(t);
  boom.stop(t + 0.6);

  // Heavy blast noise — wider band than swivel
  noise(ac, 0.2, v * 0.7, 500 + Math.random() * 200, 1.0);

  // Sub-bass thump — felt more than heard
  const sub = ac.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(35, t);
  sub.frequency.exponentialRampToValueAtTime(15, t + 0.3);
  const subGain = ac.createGain();
  subGain.gain.setValueAtTime(v * 0.5, t);
  subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  sub.connect(subGain).connect(ac.destination);
  sub.start(t);
  sub.stop(t + 0.35);
}

export function sfxCannonFire() {
  const ac = getCtx();
  const v = masterVolume * 0.4;
  const t = ac.currentTime;

  // Low boom — the main cannon report
  const boom = ac.createOscillator();
  boom.type = 'sine';
  boom.frequency.setValueAtTime(80, t);
  boom.frequency.exponentialRampToValueAtTime(30, t + 0.4);
  const boomGain = ac.createGain();
  boomGain.gain.setValueAtTime(v, t);
  boomGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  boom.connect(boomGain).connect(ac.destination);
  boom.start(t);
  boom.stop(t + 0.5);

  // Noise burst — the crack/blast
  noise(ac, 0.15, v * 0.6, 800, 1.5);

  // High metallic ping — swivel gun ring
  ping(ac, 2200, 0.08, v * 0.15, 'sine');
  ping(ac, 1400, 0.12, v * 0.1, 'triangle');
}

export function sfxCannonImpact() {
  const ac = getCtx();
  const v = masterVolume * 0.35;
  const t = ac.currentTime;

  // Thud
  const thud = ac.createOscillator();
  thud.type = 'sine';
  thud.frequency.setValueAtTime(120, t);
  thud.frequency.exponentialRampToValueAtTime(40, t + 0.25);
  const thudGain = ac.createGain();
  thudGain.gain.setValueAtTime(v, t);
  thudGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  thud.connect(thudGain).connect(ac.destination);
  thud.start(t);
  thud.stop(t + 0.3);

  // Splintering wood — noise burst
  noise(ac, 0.2, v * 0.5, 1200, 2);
}

export function sfxCannonSplash() {
  const ac = getCtx();
  const v = masterVolume * 0.2;
  // Water splash — short filtered noise
  noise(ac, 0.25, v, 600, 0.8);
}

/** War rocket launch — scaled-up swivel fire: harder initial boom,
 *  sustained hissing/sizzling tail conveying powder burn, rising whistle
 *  pitch so the shot feels alive as it streaks out. */
export function sfxRocketFire() {
  const ac = getCtx();
  const v = masterVolume * 0.5;
  const t = ac.currentTime;

  // Ignition boom — lower and longer than the swivel.
  const boom = ac.createOscillator();
  boom.type = 'sine';
  boom.frequency.setValueAtTime(70, t);
  boom.frequency.exponentialRampToValueAtTime(22, t + 0.55);
  const boomGain = ac.createGain();
  boomGain.gain.setValueAtTime(v, t);
  boomGain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
  boom.connect(boomGain).connect(ac.destination);
  boom.start(t);
  boom.stop(t + 0.6);

  // Whoosh — wider-bandwidth noise burst (the powder blast).
  noise(ac, 0.3, v * 0.75, 600, 1.1);

  // Sustained sizzle — a quieter, longer noise tail that sells the rocket
  // trail rather than a single muzzle crack.
  noise(ac, 0.9, v * 0.25, 2400, 0.9);

  // Rising whistle — the iconic bottle-rocket upward pitch sweep.
  const whistle = ac.createOscillator();
  whistle.type = 'triangle';
  whistle.frequency.setValueAtTime(900, t + 0.05);
  whistle.frequency.exponentialRampToValueAtTime(2600, t + 0.85);
  const whistleGain = ac.createGain();
  whistleGain.gain.setValueAtTime(0, t);
  whistleGain.gain.linearRampToValueAtTime(v * 0.22, t + 0.1);
  whistleGain.gain.exponentialRampToValueAtTime(0.001, t + 0.95);
  whistle.connect(whistleGain).connect(ac.destination);
  whistle.start(t);
  whistle.stop(t + 1.0);
}

/** In-flight rocket scream — sustained wobbly shriek for the rocket's
 *  flight duration. Call immediately after sfxRocketFire; starts with a
 *  brief delay so it doesn't overlap the launch boom. */
export function sfxRocketWhistle(flightDuration = 1.8) {
  const ac = getCtx();
  const v = masterVolume * 0.28;
  const t = ac.currentTime;
  const start = t + 0.28; // let the launch boom settle first

  // Main screech — descends slightly (Doppler) as the rocket moves away.
  const scream = ac.createOscillator();
  scream.type = 'sawtooth';
  scream.frequency.setValueAtTime(1550, start);
  scream.frequency.linearRampToValueAtTime(1100, start + flightDuration * 0.85);

  // LFO gives the characteristic "wobbly" mid-flight scream.
  const lfo = ac.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 7;
  const lfoGain = ac.createGain();
  lfoGain.gain.value = 110;
  lfo.connect(lfoGain).connect(scream.frequency);

  const screamGain = ac.createGain();
  screamGain.gain.setValueAtTime(0, start);
  screamGain.gain.linearRampToValueAtTime(v, start + 0.1);
  screamGain.gain.setValueAtTime(v, start + flightDuration * 0.6);
  screamGain.gain.exponentialRampToValueAtTime(0.001, start + flightDuration);

  scream.connect(screamGain).connect(ac.destination);
  lfo.start(start);
  lfo.stop(start + flightDuration + 0.05);
  scream.start(start);
  scream.stop(start + flightDuration + 0.05);

  // Hiss of burning powder charge running the full flight.
  noise(ac, flightDuration * 0.85, v * 0.18, 3800, 0.9);
}

/** War rocket impact — deep concussive blast with crackle tail. */
export function sfxRocketImpact() {
  const ac = getCtx();
  const v = masterVolume * 0.72;
  const t = ac.currentTime;

  // Sub-bass punch — the concussive shockwave felt in the chest.
  const sub = ac.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(65, t);
  sub.frequency.exponentialRampToValueAtTime(16, t + 0.8);
  const subGain = ac.createGain();
  subGain.gain.setValueAtTime(v * 0.9, t);
  subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
  sub.connect(subGain).connect(ac.destination);
  sub.start(t);
  sub.stop(t + 0.85);

  // Explosion body: three overlapping noise layers for width and presence.
  noise(ac, 0.55, v * 0.9, 280, 0.6);   // fat sub-body
  noise(ac, 0.35, v * 0.65, 1100, 1.3); // midrange crack
  noise(ac, 0.12, v * 0.5, 3200, 2.0);  // sharp initial transient

  // Crackle tail — staggered high-frequency bursts read as burning splinters.
  setTimeout(() => noise(ac, 0.22, v * 0.32, 2000, 1.5), 55);
  setTimeout(() => noise(ac, 0.18, v * 0.22, 3200, 1.2), 120);
  setTimeout(() => noise(ac, 0.14, v * 0.14, 4200, 1.0), 210);

  // Bamboo-splinter pings: metallic debris flutter.
  ping(ac, 2600, 0.07, v * 0.22, 'triangle');
  ping(ac, 1100, 0.14, v * 0.16, 'sine');
  setTimeout(() => ping(ac, 1900, 0.07, v * 0.13, 'triangle'), 30);
  setTimeout(() => ping(ac, 700,  0.2,  v * 0.1,  'sine'),     80);
}

/** Matchlock musket fire — sharper, drier, higher than the swivel boom. */
export function sfxMusket() {
  const ac = getCtx();
  const v = masterVolume * 0.35;
  const t = ac.currentTime;

  // Sharp crack — quick pitch drop, much shorter envelope than a cannon
  const crack = ac.createOscillator();
  crack.type = 'sawtooth';
  crack.frequency.setValueAtTime(180, t);
  crack.frequency.exponentialRampToValueAtTime(60, t + 0.08);
  const crackGain = ac.createGain();
  crackGain.gain.setValueAtTime(v * 0.7, t);
  crackGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  crack.connect(crackGain).connect(ac.destination);
  crack.start(t);
  crack.stop(t + 0.2);

  // White noise burst — the powder report
  noise(ac, 0.09, v * 0.8, 2400, 1.2);
  // Brief metallic ring from the lock plate
  ping(ac, 3200, 0.05, v * 0.12, 'square');
  // Distant rolling echo tail
  noise(ac, 0.35, v * 0.15, 400, 0.7);
}

/** Hunting bow release — taut twang plus a soft arrow whoosh. */
export function sfxBowRelease() {
  const ac = getCtx();
  const v = masterVolume * 0.3;
  const t = ac.currentTime;

  // String twang — pitched body that decays fast
  const twang = ac.createOscillator();
  twang.type = 'triangle';
  twang.frequency.setValueAtTime(420, t);
  twang.frequency.exponentialRampToValueAtTime(180, t + 0.18);
  const twangGain = ac.createGain();
  twangGain.gain.setValueAtTime(v * 0.6, t);
  twangGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  twang.connect(twangGain).connect(ac.destination);
  twang.start(t);
  twang.stop(t + 0.25);

  // Short whoosh — the arrow leaving
  noise(ac, 0.18, v * 0.25, 1500, 0.9);
}

/** Funeral bell — single solemn toll for crew death */
export function sfxFuneralBell() {
  const ac = getCtx();
  const v = masterVolume * 0.3;
  const t = ac.currentTime;

  // Bell strike — two sine tones for a rich bell timbre
  const f1 = ac.createOscillator();
  f1.type = 'sine';
  f1.frequency.value = 220;
  const f2 = ac.createOscillator();
  f2.type = 'sine';
  f2.frequency.value = 554; // overtone
  const g1 = ac.createGain();
  g1.gain.setValueAtTime(v, t);
  g1.gain.exponentialRampToValueAtTime(v * 0.3, t + 0.8);
  g1.gain.exponentialRampToValueAtTime(0.001, t + 3.0);
  const g2 = ac.createGain();
  g2.gain.setValueAtTime(v * 0.25, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 2.0);
  f1.connect(g1).connect(ac.destination);
  f2.connect(g2).connect(ac.destination);
  f1.start(t);
  f1.stop(t + 3.0);
  f2.start(t);
  f2.stop(t + 2.0);

  // Soft metallic shimmer
  noise(ac, 0.15, v * 0.15, 3000, 2);
}

/** Ship sinking — deep groan + water rush + cracking timber */
export function sfxShipSink() {
  const ac = getCtx();
  const v = masterVolume * 0.4;
  const t = ac.currentTime;

  // Deep hull groan — descending sine
  const groan = ac.createOscillator();
  groan.type = 'sine';
  groan.frequency.setValueAtTime(100, t);
  groan.frequency.exponentialRampToValueAtTime(25, t + 1.5);
  const groanGain = ac.createGain();
  groanGain.gain.setValueAtTime(v, t);
  groanGain.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
  groan.connect(groanGain).connect(ac.destination);
  groan.start(t);
  groan.stop(t + 1.5);

  // Timber cracking — sharp noise bursts
  for (let i = 0; i < 3; i++) {
    const delay = 0.1 + i * 0.25;
    const len = ac.sampleRate * 0.08;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let j = 0; j < len; j++) data[j] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const filt = ac.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 1800 + i * 400;
    filt.Q.value = 3;
    const g = ac.createGain();
    g.gain.setValueAtTime(v * 0.4, t + delay);
    g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.1);
    src.connect(filt).connect(g).connect(ac.destination);
    src.start(t + delay);
    src.stop(t + delay + 0.1);
  }

  // Water rushing in — long low noise
  noise(ac, 1.2, v * 0.35, 300, 0.5);
}

export function sfxAnchorWeigh() {
  const ac = getCtx();
  const v = masterVolume * 0.3;
  const t = ac.currentTime;

  // Chain rattle ascending
  for (let i = 0; i < 6; i++) {
    const delay = i * 0.08;
    const freq = 180 + i * 30 + Math.random() * 40;
    ping(ac, freq, 0.06, v * 0.2, 'triangle');
  }

  // Creak — frequency-modulated sine
  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(300, t + 0.1);
  osc.frequency.linearRampToValueAtTime(450, t + 0.35);
  osc.frequency.linearRampToValueAtTime(280, t + 0.5);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.001, t + 0.1);
  g.gain.linearRampToValueAtTime(v * 0.15, t + 0.2);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
  osc.connect(g).connect(ac.destination);
  osc.start(t + 0.1);
  osc.stop(t + 0.6);
}

/** Warm harbor bell — plays when the player reaches a port. */
export function sfxPortArrival() {
  const ac = getCtx();
  const v = masterVolume * 0.25;
  const t = ac.currentTime;

  // Warm bell tone — two harmonics for a rich, welcoming chime
  const bell1 = ac.createOscillator();
  bell1.type = 'sine';
  bell1.frequency.value = 523; // C5
  const g1 = ac.createGain();
  g1.gain.setValueAtTime(v * 0.4, t);
  g1.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
  bell1.connect(g1).connect(ac.destination);
  bell1.start(t);
  bell1.stop(t + 0.85);

  // Second partial — minor third above for warmth
  const bell2 = ac.createOscillator();
  bell2.type = 'sine';
  bell2.frequency.value = 659; // E5
  const g2 = ac.createGain();
  g2.gain.setValueAtTime(v * 0.2, t + 0.05);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
  bell2.connect(g2).connect(ac.destination);
  bell2.start(t + 0.05);
  bell2.stop(t + 0.65);

  // Subtle splash of noise — harbor ambiance texture
  noise(ac, 0.15, v * 0.12, 1200, 1);
}

/** Very soft puff for dismissing toasts — lighter than a click. */
export function sfxDismiss() {
  const ac = getCtx();
  const v = masterVolume * 0.12;
  noise(ac, 0.04, v, 3000, 1.5);
}

// ── Ship hailing: bell + language-flavored babble ───────────

type BabbleFamily = 'european' | 'arabic' | 'southasian' | 'swahili' | 'malay' | 'eastasian';

const LANGUAGE_TO_FAMILY: Record<string, BabbleFamily> = {
  Portuguese: 'european', Dutch: 'european', English: 'european',
  Spanish: 'european', French: 'european',
  Arabic: 'arabic', Persian: 'arabic', Turkish: 'arabic',
  Gujarati: 'southasian', Hindustani: 'southasian',
  Swahili: 'swahili',
  Malay: 'malay',
  Chinese: 'eastasian', Japanese: 'eastasian',
};

interface BabbleParams {
  formant1: number;     // first vowel-color frequency
  formant2: number;     // second vowel-color frequency
  syllableRate: number; // AM speed — perceived "pace" of speech
  intonation: number;   // how much formant freqs waver (pitch movement)
  duration: number;     // total babble length in seconds
}

const BABBLE: Record<BabbleFamily, BabbleParams> = {
  //                     f1    f2   rate  inton  dur
  european:   { formant1: 500, formant2: 1500, syllableRate: 4.0,  intonation: 0.12, duration: 1.5 },
  arabic:     { formant1: 400, formant2:  900, syllableRate: 3.0,  intonation: 0.20, duration: 1.8 },
  southasian: { formant1: 520, formant2: 1400, syllableRate: 4.5,  intonation: 0.30, duration: 1.5 },
  swahili:    { formant1: 600, formant2: 1800, syllableRate: 5.0,  intonation: 0.22, duration: 1.4 },
  malay:      { formant1: 550, formant2: 1600, syllableRate: 5.5,  intonation: 0.12, duration: 1.2 },
  eastasian:  { formant1: 450, formant2: 1200, syllableRate: 3.5,  intonation: 0.45, duration: 1.3 },
};

/** Ship hail — metallic bell clang followed by distant language-flavored babble.
 *  Pass the NPC's hailLanguage (e.g. "Portuguese", "Arabic"). */
export function sfxShipHail(language: string) {
  const ac = getCtx();
  const v = masterVolume * 0.35;
  const t = ac.currentTime;

  // ── Bell clang ──────────────────────────────────────────
  const bell = ac.createOscillator();
  bell.type = 'sine';
  bell.frequency.value = 880;
  const bellG = ac.createGain();
  bellG.gain.setValueAtTime(v * 0.5, t);
  bellG.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  bell.connect(bellG).connect(ac.destination);
  bell.start(t);
  bell.stop(t + 0.55);

  // Inharmonic partial — gives metallic quality
  const bell2 = ac.createOscillator();
  bell2.type = 'sine';
  bell2.frequency.value = 2200;
  const bell2G = ac.createGain();
  bell2G.gain.setValueAtTime(v * 0.18, t);
  bell2G.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  bell2.connect(bell2G).connect(ac.destination);
  bell2.start(t);
  bell2.stop(t + 0.35);

  // Sharp attack transient
  noise(ac, 0.025, v * 0.3, 4000, 2);

  // ── Babble ──────────────────────────────────────────────
  const family = LANGUAGE_TO_FAMILY[language] ?? 'european';
  const p = BABBLE[family];
  const bv = masterVolume * 0.15;        // babble is quieter than bell
  const bStart = t + 0.4;                // begins after bell rings

  // Noise source — raw material for "speech"
  const len = ac.sampleRate * p.duration;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;

  // Two formant bandpass filters — give the noise vowel-like color
  const f1 = ac.createBiquadFilter();
  f1.type = 'bandpass'; f1.frequency.value = p.formant1; f1.Q.value = 4;
  const f2 = ac.createBiquadFilter();
  f2.type = 'bandpass'; f2.frequency.value = p.formant2; f2.Q.value = 3;

  const f1G = ac.createGain(); f1G.gain.value = 0.55;
  const f2G = ac.createGain(); f2G.gain.value = 0.4;

  // Master babble gain — envelope + AM target
  const babbleGain = ac.createGain();

  // Envelope: fade in, sustain, fade out
  babbleGain.gain.setValueAtTime(0, bStart);
  babbleGain.gain.linearRampToValueAtTime(bv, bStart + 0.06);
  babbleGain.gain.setValueAtTime(bv, bStart + p.duration - 0.3);
  babbleGain.gain.linearRampToValueAtTime(0, bStart + p.duration);

  // Syllable rhythm — two LFOs at non-harmonic ratio for aperiodic pattern
  const lfo1 = ac.createOscillator();
  lfo1.type = 'sine';
  lfo1.frequency.value = p.syllableRate;
  const lfo1G = ac.createGain();
  lfo1G.gain.value = bv * 0.55;
  lfo1.connect(lfo1G).connect(babbleGain.gain);

  const lfo2 = ac.createOscillator();
  lfo2.type = 'sine';
  lfo2.frequency.value = p.syllableRate * 0.73; // irrational ratio → no repeating pattern
  const lfo2G = ac.createGain();
  lfo2G.gain.value = bv * 0.35;
  lfo2.connect(lfo2G).connect(babbleGain.gain);

  // Intonation — slow waver on formant frequencies (pitch contour)
  const intonLfo = ac.createOscillator();
  intonLfo.type = 'sine';
  intonLfo.frequency.value = 0.4;
  const inton1 = ac.createGain();
  inton1.gain.value = p.formant1 * p.intonation;
  const inton2 = ac.createGain();
  inton2.gain.value = p.formant2 * p.intonation;
  intonLfo.connect(inton1).connect(f1.frequency);
  intonLfo.connect(inton2).connect(f2.frequency);

  // Distance filter — lowpass so it sounds like it's across water
  const dist = ac.createBiquadFilter();
  dist.type = 'lowpass';
  dist.frequency.value = 2500;

  // Wire: src → f1/f2 → gains → babbleGain → distance → output
  src.connect(f1).connect(f1G).connect(babbleGain);
  src.connect(f2).connect(f2G).connect(babbleGain);
  babbleGain.connect(dist).connect(ac.destination);

  // Schedule
  lfo1.start(bStart); lfo2.start(bStart); intonLfo.start(bStart); src.start(bStart);
  const bEnd = bStart + p.duration + 0.05;
  lfo1.stop(bEnd); lfo2.stop(bEnd); intonLfo.stop(bEnd); src.stop(bEnd);
}

/** Herd hoofbeats — rapid soft thumps as grazers scatter. */
export function sfxHoofbeats(x?: number, z?: number) {
  const ac = getCtx();
  const v = masterVolume * 0.32;
  const t = ac.currentTime;
  const dest: AudioNode = (x !== undefined && z !== undefined) ? spatialDest(ac, x, z) : ac.destination;
  // 6 rapid low thuds with jitter — overlapping hooves
  for (let i = 0; i < 6; i++) {
    const start = t + i * 0.055 + Math.random() * 0.02;
    const len = ac.sampleRate * 0.05;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let j = 0; j < len; j++) data[j] = (Math.random() * 2 - 1) * (1 - j / len);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const filt = ac.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 180 + Math.random() * 80;
    filt.Q.value = 2;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(v * (0.5 + Math.random() * 0.5), start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.08);
    src.connect(filt).connect(gain).connect(dest);
    src.start(start);
    src.stop(start + 0.1);
  }
}

/** Flock takeoff — sweeping wing flap whoosh. */
export function sfxBirdFlap(x?: number, z?: number) {
  const ac = getCtx();
  const v = masterVolume * 0.28;
  const t = ac.currentTime;
  const dest: AudioNode = (x !== undefined && z !== undefined) ? spatialDest(ac, x, z) : ac.destination;
  // Three stacked flap bursts — filtered noise sweeping low→high→low
  for (let i = 0; i < 3; i++) {
    const start = t + i * 0.12;
    const len = ac.sampleRate * 0.25;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let j = 0; j < len; j++) data[j] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const filt = ac.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(400, start);
    filt.frequency.linearRampToValueAtTime(1200, start + 0.12);
    filt.frequency.linearRampToValueAtTime(500, start + 0.24);
    filt.Q.value = 1.5;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.linearRampToValueAtTime(v * 0.7, start + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.24);
    src.connect(filt).connect(gain).connect(dest);
    src.start(start);
    src.stop(start + 0.25);
  }
}

/** Reptile scrabble — short scratchy noise as a lizard lurches away. */
export function sfxReptileScrabble(x?: number, z?: number) {
  const ac = getCtx();
  const v = masterVolume * 0.25;
  const t = ac.currentTime;
  const dest: AudioNode = (x !== undefined && z !== undefined) ? spatialDest(ac, x, z) : ac.destination;
  // Short rasping noise, filtered mid-high
  const len = ac.sampleRate * 0.2;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (0.5 + 0.5 * Math.sin(i * 0.08));
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filt = ac.createBiquadFilter();
  filt.type = 'bandpass';
  filt.frequency.value = 1800;
  filt.Q.value = 4;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.001, t);
  gain.gain.linearRampToValueAtTime(v * 0.7, t + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  src.connect(filt).connect(gain).connect(dest);
  src.start(t);
  src.stop(t + 0.22);
}

/** Primate alarm chatter — short high-pitched yelps. */
/** Butchering a carcass — low thunk, wet squelch, then a soft loot chime. */
export function sfxHarvest(x?: number, z?: number) {
  const ac = getCtx();
  const v = masterVolume * 0.38;
  const t = ac.currentTime;
  const dest: AudioNode = (x !== undefined && z !== undefined) ? spatialDest(ac, x, z) : ac.destination;

  // Low body thunk — knife into flesh
  const thunkLen = ac.sampleRate * 0.12;
  const thunkBuf = ac.createBuffer(1, thunkLen, ac.sampleRate);
  const thunkData = thunkBuf.getChannelData(0);
  for (let i = 0; i < thunkLen; i++) thunkData[i] = Math.random() * 2 - 1;
  const thunkSrc = ac.createBufferSource();
  thunkSrc.buffer = thunkBuf;
  const thunkFilt = ac.createBiquadFilter();
  thunkFilt.type = 'lowpass';
  thunkFilt.frequency.setValueAtTime(350, t);
  thunkFilt.frequency.exponentialRampToValueAtTime(120, t + 0.12);
  const thunkGain = ac.createGain();
  thunkGain.gain.setValueAtTime(v * 0.55, t);
  thunkGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  thunkSrc.connect(thunkFilt).connect(thunkGain).connect(dest);
  thunkSrc.start(t);
  thunkSrc.stop(t + 0.12);

  // Wet squelch — mid bandpass burst layered on top
  const squelchLen = ac.sampleRate * 0.18;
  const squelchBuf = ac.createBuffer(1, squelchLen, ac.sampleRate);
  const squelchData = squelchBuf.getChannelData(0);
  for (let i = 0; i < squelchLen; i++) squelchData[i] = Math.random() * 2 - 1;
  const squelchSrc = ac.createBufferSource();
  squelchSrc.buffer = squelchBuf;
  const squelchFilt = ac.createBiquadFilter();
  squelchFilt.type = 'bandpass';
  squelchFilt.frequency.setValueAtTime(900, t + 0.02);
  squelchFilt.frequency.exponentialRampToValueAtTime(420, t + 0.18);
  squelchFilt.Q.value = 1.8;
  const squelchGain = ac.createGain();
  squelchGain.gain.setValueAtTime(0.001, t + 0.02);
  squelchGain.gain.linearRampToValueAtTime(v * 0.3, t + 0.05);
  squelchGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  squelchSrc.connect(squelchFilt).connect(squelchGain).connect(dest);
  squelchSrc.start(t + 0.02);
  squelchSrc.stop(t + 0.2);

  // Reward chime — two-note lift (D5 → A5) after the butcher sounds settle
  const chimeStart = t + 0.22;
  const notes = [587, 880];
  for (let i = 0; i < notes.length; i++) {
    const start = chimeStart + i * 0.08;
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = notes[i];
    const g = ac.createGain();
    g.gain.setValueAtTime(0.001, start);
    g.gain.linearRampToValueAtTime(v * 0.38, start + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
    osc.connect(g).connect(dest);
    osc.start(start);
    osc.stop(start + 0.24);

    // Triangle shimmer octave above
    const osc2 = ac.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = notes[i] * 2.003;
    const g2 = ac.createGain();
    g2.gain.setValueAtTime(0.001, start);
    g2.gain.linearRampToValueAtTime(v * 0.08, start + 0.015);
    g2.gain.exponentialRampToValueAtTime(0.001, start + 0.2);
    osc2.connect(g2).connect(dest);
    osc2.start(start);
    osc2.stop(start + 0.22);
  }
}

export function sfxPrimateChatter(x?: number, z?: number) {
  const ac = getCtx();
  const v = masterVolume * 0.22;
  const t = ac.currentTime;
  const dest: AudioNode = (x !== undefined && z !== undefined) ? spatialDest(ac, x, z) : ac.destination;
  // Three quick chirps of varying pitch
  const pitches = [1400, 1700, 1550];
  for (let i = 0; i < pitches.length; i++) {
    const start = t + i * 0.08 + Math.random() * 0.03;
    const osc = ac.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(pitches[i], start);
    osc.frequency.linearRampToValueAtTime(pitches[i] * 0.7, start + 0.09);
    const filt = ac.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = pitches[i];
    filt.Q.value = 6;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.linearRampToValueAtTime(v * 0.6, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.12);
    osc.connect(filt).connect(gain).connect(dest);
    osc.start(start);
    osc.stop(start + 0.14);
  }
}
