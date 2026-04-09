// Synthesized UI sound effects — no audio files needed.
// Inspired by Diablo 2's minimalist, tactile menu sounds.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
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

  // Crowd murmur — bandpass-filtered noise with slow amplitude modulation
  const crowd = createLoopingNoise(ac, 2);
  const crowdFilt = ac.createBiquadFilter();
  crowdFilt.type = 'bandpass';
  crowdFilt.frequency.value = 500;
  crowdFilt.Q.value = 0.8;
  const crowdGain = ac.createGain();
  crowdGain.gain.value = 0.3;
  // LFO for crowd swell
  const crowdLfo = ac.createOscillator();
  crowdLfo.type = 'sine';
  crowdLfo.frequency.value = 0.15;
  const crowdLfoGain = ac.createGain();
  crowdLfoGain.gain.value = 0.1;
  crowdLfo.connect(crowdLfoGain).connect(crowdGain.gain);
  crowdLfo.start(t);
  crowd.connect(crowdFilt).connect(crowdGain).connect(master);
  crowd.start(t);
  sources.push(crowd);
  oscillators.push(crowdLfo);

  // Clanking/metallic — higher filtered noise, intermittent
  const clank = createLoopingNoise(ac, 0.5);
  const clankFilt = ac.createBiquadFilter();
  clankFilt.type = 'bandpass';
  clankFilt.frequency.value = 2800;
  clankFilt.Q.value = 5;
  const clankGain = ac.createGain();
  clankGain.gain.value = 0.06;
  // LFO makes it come and go
  const clankLfo = ac.createOscillator();
  clankLfo.type = 'sine';
  clankLfo.frequency.value = 0.3;
  const clankLfoGain = ac.createGain();
  clankLfoGain.gain.value = 0.05;
  clankLfo.connect(clankLfoGain).connect(clankGain.gain);
  clankLfo.start(t);
  clank.connect(clankFilt).connect(clankGain).connect(master);
  clank.start(t);
  sources.push(clank);
  oscillators.push(clankLfo);

  return { sources, oscillators };
}

function startShipyardAmbient(ac: AudioContext, master: GainNode) {
  const sources: AudioBufferSourceNode[] = [];
  const oscillators: OscillatorNode[] = [];
  const t = ac.currentTime;

  // Hammering rhythm — bandpassed noise pulsed by a square-ish LFO
  const hammer = createLoopingNoise(ac, 1);
  const hammerFilt = ac.createBiquadFilter();
  hammerFilt.type = 'bandpass';
  hammerFilt.frequency.value = 1200;
  hammerFilt.Q.value = 2;
  const hammerGain = ac.createGain();
  hammerGain.gain.value = 0.0;
  // Pulsing LFO ~2.5 Hz = rhythmic tapping
  const hammerLfo = ac.createOscillator();
  hammerLfo.type = 'square';
  hammerLfo.frequency.value = 2.5;
  const hammerLfoGain = ac.createGain();
  hammerLfoGain.gain.value = 0.12;
  hammerLfo.connect(hammerLfoGain).connect(hammerGain.gain);
  hammerLfo.start(t);
  hammer.connect(hammerFilt).connect(hammerGain).connect(master);
  hammer.start(t);
  sources.push(hammer);
  oscillators.push(hammerLfo);

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

  // Wood creaking — very narrow bandpass, slow
  const creak = createLoopingNoise(ac, 2);
  const creakFilt = ac.createBiquadFilter();
  creakFilt.type = 'bandpass';
  creakFilt.frequency.value = 300;
  creakFilt.Q.value = 8;
  const creakGain = ac.createGain();
  creakGain.gain.value = 0.04;
  const creakLfo = ac.createOscillator();
  creakLfo.type = 'sine';
  creakLfo.frequency.value = 0.08;
  const creakLfoGain = ac.createGain();
  creakLfoGain.gain.value = 0.04;
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

/** Start ambient loop for a port modal tab. Stops any currently playing tab ambient. */
export function startTabAmbient(tab: string) {
  if (tab === activeTabType) return; // already playing
  stopTabAmbient(0.3);

  const ac = getCtx();
  const master = ac.createGain();
  const v = masterVolume * 0.25;
  master.gain.setValueAtTime(0, ac.currentTime);
  master.gain.linearRampToValueAtTime(v, ac.currentTime + 0.5);
  master.connect(ac.destination);

  let nodes: { sources: AudioBufferSourceNode[]; oscillators: OscillatorNode[] };
  switch (tab) {
    case 'market':   nodes = startMarketAmbient(ac, master); break;
    case 'shipyard': nodes = startShipyardAmbient(ac, master); break;
    case 'tavern':   nodes = startTavernAmbient(ac, master); break;
    case 'governor': nodes = startGovernorAmbient(ac, master); break;
    default:         nodes = { sources: [], oscillators: [] }; break;
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

/** Metallic coin clink for buy/sell. */
export function sfxCoin() {
  const ac = getCtx();
  const v = masterVolume * 0.3;
  // Two detuned high pings = coin-like shimmer
  ping(ac, 4200, 0.08, v * 0.5);
  ping(ac, 5600, 0.06, v * 0.35);
  ping(ac, 3100, 0.1, v * 0.2);
  noise(ac, 0.03, v * 0.2, 6000, 3);
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
