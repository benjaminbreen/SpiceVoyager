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
