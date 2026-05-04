// Generative ambient soundscape — three layers crossfaded by game state.
// All synthesis runs on the Web Audio thread; the main thread only sets
// gain targets every ~500ms via exponentialRampToValueAtTime.

import type { Building, Culture } from '../store/gameStore';
import { SEA_LEVEL } from '../constants/world';
import { getTerrainData } from '../utils/terrain';
import { placeHinterlandScenes, type SceneInstance } from '../utils/hinterlandScenes';

interface AmbientState {
  playerMode: 'ship' | 'walking';
  playerPos: [number, number, number];
  walkingPos: [number, number, number];
  ports: {
    id?: string;
    culture?: Culture;
    position: [number, number, number];
    buildings?: Building[];
  }[];
  worldSeed: number;
  speed: number;
  playerRot: number;
  timeOfDay: number;
  paused: boolean;
}

interface AmbientPortProfile {
  shore: number;
  nearOcean: number;
  port: number;
}

const DEFAULT_AMBIENT_PROFILE: AmbientPortProfile = {
  shore: 0.028,
  nearOcean: 0.45,
  port: 0.032,
};

const PORT_AMBIENT_PROFILES: Record<string, Partial<AmbientPortProfile>> = {
  seville: { shore: 0.004, nearOcean: 0.12, port: 0.042 },
  london: { shore: 0.004, nearOcean: 0.12, port: 0.04 },
  amsterdam: { shore: 0.006, nearOcean: 0.14, port: 0.04 },
  venice: { shore: 0.008, nearOcean: 0.16, port: 0.038 },
  surat: { shore: 0.007, nearOcean: 0.16, port: 0.038 },
  masulipatnam: { shore: 0.008, nearOcean: 0.18, port: 0.036 },
  lisbon: { shore: 0.012, nearOcean: 0.24, port: 0.036 },
  goa: { shore: 0.014, nearOcean: 0.28, port: 0.036 },
  malacca: { shore: 0.012, nearOcean: 0.26, port: 0.038 },
  havana: { shore: 0.012, nearOcean: 0.24, port: 0.036 },
  cartagena: { shore: 0.012, nearOcean: 0.24, port: 0.036 },
  muscat: { shore: 0.016, nearOcean: 0.32, port: 0.034 },
  mombasa: { shore: 0.018, nearOcean: 0.34, port: 0.034 },
  calicut: { shore: 0.034, nearOcean: 0.6, port: 0.03 },
  cape: { shore: 0.036, nearOcean: 0.62, port: 0.028 },
  socotra: { shore: 0.032, nearOcean: 0.56, port: 0.028 },
};

function getAmbientProfile(portId: string | undefined): AmbientPortProfile {
  return { ...DEFAULT_AMBIENT_PROFILE, ...(portId ? PORT_AMBIENT_PROFILES[portId] : undefined) };
}

function isFireScene(kind: SceneInstance['kind']) {
  return kind === 'shepherds-fire'
    || kind === 'charcoal-mound'
    || kind === 'coffee-mat'
    || kind === 'roadside-shrine';
}

class AmbientEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private volume = 0.22;
  private started = false;

  // Layer gains
  private oceanGain: GainNode | null = null;
  private shoreGain: GainNode | null = null;
  private portGain: GainNode | null = null;
  private vegetationGain: GainNode | null = null;
  private fireGain: GainNode | null = null;

  // Sailing layer — three sub-components
  private hullWashGain: GainNode | null = null;
  private riggingWindGain: GainNode | null = null;
  private riggingWindFilter: BiquadFilterNode | null = null;
  private sailTensionGain: GainNode | null = null;
  private sailTensionLfoGain: GainNode | null = null;

  // Source nodes (kept alive for the lifetime of the engine)
  private oceanSources: { noise: AudioBufferSourceNode; lfo: OscillatorNode } | null = null;
  private shoreSources: { noise: AudioBufferSourceNode; lfoGain: GainNode } | null = null;
  private portSources: { osc1: OscillatorNode; osc2: OscillatorNode; osc3: OscillatorNode } | null = null;
  private vegetationSources: { noise: AudioBufferSourceNode; filter: BiquadFilterNode; lfo: OscillatorNode } | null = null;
  private fireSources: { noise: AudioBufferSourceNode; lfo: OscillatorNode } | null = null;
  private riggingWindSources: { osc1: OscillatorNode; osc2: OscillatorNode } | null = null;

  // Rotation tracking for turn-based effects
  private lastRot = 0;

  private userHasInteracted = false;
  private sceneCache = new Map<string, SceneInstance[]>();

  // Splash-screen lock: while true, update() is a no-op so the position-driven
  // gain logic can't override the levels we set in playSplashAmbient(). The
  // first update() call from GameScene clears it, letting normal play take over.
  private splashMode = false;

  /** Mark that the user has interacted — call from a click/key handler. */
  markInteracted() {
    this.userHasInteracted = true;
  }

  /** Lazily boot the audio graph on first update (needs user gesture context). */
  private boot() {
    if (this.started) return;
    if (!this.userHasInteracted) return; // don't create AudioContext before gesture
    this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') this.ctx.resume();

    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);

    this.buildOcean();
    this.buildShore();
    this.buildPort();
    this.buildVegetation();
    this.buildFire();
    this.buildSailingLayer();
    this.started = true;
  }

  // ── Ocean: brown-noise rumble with slow swell modulation ──────────

  private buildOcean() {
    const ac = this.ctx!;
    // Generate brown noise buffer (2s, looped)
    const len = ac.sampleRate * 2;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5; // amplify — brown noise is quiet
    }

    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    // Low-pass for deep ocean rumble
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 280;
    lp.Q.value = 0.5;

    // LFO modulates the filter frequency for gentle swells
    const lfo = ac.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.12; // ~8s cycle
    const lfoDepth = ac.createGain();
    lfoDepth.gain.value = 80;
    lfo.connect(lfoDepth).connect(lp.frequency);

    this.oceanGain = ac.createGain();
    this.oceanGain.gain.value = 0.0001; // start silent

    src.connect(lp).connect(this.oceanGain).connect(this.master!);
    src.start();
    lfo.start();

    this.oceanSources = { noise: src, lfo };
  }

  // ── Shore: mid-frequency surf pulses ──────────────────────────────

  private buildShore() {
    const ac = this.ctx!;
    // White noise through bandpass = surf character
    const len = ac.sampleRate * 2;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 600;
    bp.Q.value = 0.4;

    // Amplitude LFO for wave-crash rhythm (irregular feel via low freq)
    const lfo = ac.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.18; // ~5.5s between "waves"
    const lfoGain = ac.createGain();
    lfoGain.gain.value = 0.5;

    // The LFO modulates a gain node that sits between filter and output
    const modGain = ac.createGain();
    modGain.gain.value = 0.5; // base level (LFO swings ±0.5 around this)
    lfo.connect(lfoGain).connect(modGain.gain);

    this.shoreGain = ac.createGain();
    this.shoreGain.gain.value = 0.0001;

    src.connect(bp).connect(modGain).connect(this.shoreGain).connect(this.master!);
    lfo.start();
    src.start();

    this.shoreSources = { noise: src, lfoGain };
  }

  // ── Port hum: warm drone with faint harmonics ─────────────────────

  private buildPort() {
    const ac = this.ctx!;

    // Three detuned oscillators = warm, alive drone
    const osc1 = ac.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 82; // low E

    const osc2 = ac.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = 123.5; // B, slightly detuned

    const osc3 = ac.createOscillator();
    osc3.type = 'sine';
    osc3.frequency.value = 165; // E octave, hint of shimmer

    // Individual gains to shape the chord
    const g1 = ac.createGain(); g1.gain.value = 0.5;
    const g2 = ac.createGain(); g2.gain.value = 0.25;
    const g3 = ac.createGain(); g3.gain.value = 0.12;

    // Gentle low-pass to soften
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 300;
    lp.Q.value = 0.3;

    this.portGain = ac.createGain();
    this.portGain.gain.value = 0.0001;

    osc1.connect(g1).connect(lp);
    osc2.connect(g2).connect(lp);
    osc3.connect(g3).connect(lp);
    lp.connect(this.portGain).connect(this.master!);

    osc1.start();
    osc2.start();
    osc3.start();

    this.portSources = { osc1, osc2, osc3 };
  }

  // ── Inland vegetation: filtered noise, slow gust modulation ───────

  private buildVegetation() {
    const ac = this.ctx!;
    const len = ac.sampleRate * 3;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 750;
    hp.Q.value = 0.6;

    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    lp.Q.value = 0.4;

    const lfo = ac.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.08;
    const lfoGain = ac.createGain();
    lfoGain.gain.value = 0.45;
    const modGain = ac.createGain();
    modGain.gain.value = 0.45;
    lfo.connect(lfoGain).connect(modGain.gain);

    this.vegetationGain = ac.createGain();
    this.vegetationGain.gain.value = 0.0001;

    src.connect(hp).connect(lp).connect(modGain).connect(this.vegetationGain).connect(this.master!);
    src.start();
    lfo.start();

    this.vegetationSources = { noise: src, filter: lp, lfo };
  }

  // ── Fire/embers: close-range filtered crackle for hinterland fires ──

  private buildFire() {
    const ac = this.ctx!;
    const len = ac.sampleRate * 2;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const spark = Math.random() > 0.985 ? (Math.random() * 2 - 1) * 1.6 : 0;
      const hiss = (Math.random() * 2 - 1) * 0.18;
      last = last * 0.88 + spark + hiss;
      data[i] = last;
    }

    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500;
    bp.Q.value = 0.9;

    const lfo = ac.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 3.5;
    const lfoGain = ac.createGain();
    lfoGain.gain.value = 0.18;
    const modGain = ac.createGain();
    modGain.gain.value = 0.35;
    lfo.connect(lfoGain).connect(modGain.gain);

    this.fireGain = ac.createGain();
    this.fireGain.gain.value = 0.0001;

    src.connect(bp).connect(modGain).connect(this.fireGain).connect(this.master!);
    src.start();
    lfo.start();

    this.fireSources = { noise: src, lfo };
  }

  // ── Sailing layer: hull wash + rigging wind + sail tension ──────────
  // Three subtle sub-components that together create the feeling of
  // a ship under sail, without the harsh white-noise hiss of the old wake.

  private buildSailingLayer() {
    const ac = this.ctx!;

    // ─ Hull wash: brown noise through narrow bandpass ─
    // Sounds like water slipping along a wooden hull
    const hullLen = ac.sampleRate * 3;
    const hullBuf = ac.createBuffer(1, hullLen, ac.sampleRate);
    const hullData = hullBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < hullLen; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      hullData[i] = last * 3.5;
    }
    const hullSrc = ac.createBufferSource();
    hullSrc.buffer = hullBuf;
    hullSrc.loop = true;

    // Narrow bandpass — only the mid-frequency "wash" character
    const hullBp = ac.createBiquadFilter();
    hullBp.type = 'bandpass';
    hullBp.frequency.value = 500;
    hullBp.Q.value = 0.8;

    // Slow LFO for irregular wave-lap rhythm
    const hullLfo = ac.createOscillator();
    hullLfo.type = 'sine';
    hullLfo.frequency.value = 0.25; // ~4s cycle
    const hullLfoDepth = ac.createGain();
    hullLfoDepth.gain.value = 0.3;
    const hullMod = ac.createGain();
    hullMod.gain.value = 0.5;
    hullLfo.connect(hullLfoDepth).connect(hullMod.gain);

    this.hullWashGain = ac.createGain();
    this.hullWashGain.gain.value = 0.0001;

    hullSrc.connect(hullBp).connect(hullMod).connect(this.hullWashGain).connect(this.master!);
    hullSrc.start();
    hullLfo.start();

    // ─ Rigging wind: two detuned oscillators swept by speed ─
    // Almost subliminal moaning/whistling through the rigging
    const osc1 = ac.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 180; // will sweep up with speed

    const osc2 = ac.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = 195; // slightly detuned for organic beating

    const riggingBp = ac.createBiquadFilter();
    riggingBp.type = 'bandpass';
    riggingBp.frequency.value = 400;
    riggingBp.Q.value = 2.0; // narrow — keeps it from being harsh
    this.riggingWindFilter = riggingBp;

    const g1 = ac.createGain(); g1.gain.value = 0.3;
    const g2 = ac.createGain(); g2.gain.value = 0.15;

    this.riggingWindGain = ac.createGain();
    this.riggingWindGain.gain.value = 0.0001;

    osc1.connect(g1).connect(riggingBp);
    osc2.connect(g2).connect(riggingBp);
    riggingBp.connect(this.riggingWindGain).connect(this.master!);
    osc1.start();
    osc2.start();
    this.riggingWindSources = { osc1, osc2 };

    // ─ Sail tension: amplitude-modulated filtered noise ─
    // Canvas under strain — slow pulse, only at higher speeds
    const sailLen = ac.sampleRate * 2;
    const sailBuf = ac.createBuffer(1, sailLen, ac.sampleRate);
    const sailData = sailBuf.getChannelData(0);
    // Pink-ish noise for softer character
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < sailLen; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.0990460;
      b1 = 0.96300 * b1 + white * 0.2965164;
      b2 = 0.57000 * b2 + white * 1.0526913;
      sailData[i] = (b0 + b1 + b2 + white * 0.1848) * 0.2;
    }
    const sailSrc = ac.createBufferSource();
    sailSrc.buffer = sailBuf;
    sailSrc.loop = true;

    const sailBp = ac.createBiquadFilter();
    sailBp.type = 'bandpass';
    sailBp.frequency.value = 350;
    sailBp.Q.value = 1.2;

    // Slow LFO — canvas fluttering under tension
    const sailLfo = ac.createOscillator();
    sailLfo.type = 'sine';
    sailLfo.frequency.value = 0.4; // ~2.5s pulse
    const sailLfoGain = ac.createGain();
    sailLfoGain.gain.value = 0.4;
    this.sailTensionLfoGain = sailLfoGain;
    const sailMod = ac.createGain();
    sailMod.gain.value = 0.4;
    sailLfo.connect(sailLfoGain).connect(sailMod.gain);

    this.sailTensionGain = ac.createGain();
    this.sailTensionGain.gain.value = 0.0001;

    sailSrc.connect(sailBp).connect(sailMod).connect(this.sailTensionGain).connect(this.master!);
    sailSrc.start();
    sailLfo.start();
  }

  // ── Smooth gain ramp (avoids clicks) ──────────────────────────────

  private ramp(gain: GainNode | null, target: number, duration = 2) {
    if (!gain || !this.ctx) return;
    const t = this.ctx.currentTime;
    const safeTarget = Math.max(0.0001, target); // exponentialRamp needs > 0
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value || 0.0001, t);
    gain.gain.exponentialRampToValueAtTime(safeTarget, t + duration);
  }

  private getScenesForPort(port: AmbientState['ports'][number], worldSeed: number) {
    if (!port.id || !port.culture || !port.buildings) return [];
    const key = `${port.id}:${worldSeed}:${port.buildings.length}`;
    const cached = this.sceneCache.get(key);
    if (cached) return cached;
    const scenes = placeHinterlandScenes(
      port.position[0],
      port.position[2],
      port.culture,
      port.buildings,
      worldSeed,
    );
    this.sceneCache.set(key, scenes);
    return scenes;
  }

  // ── Public API ────────────────────────────────────────────────────

  /** Boot the engine and lock ocean + shore layers to splash levels. Called
   *  by ClaudeSplashGlobe on the first user gesture. The next update() call
   *  (from GameScene once gameplay starts) automatically releases the lock. */
  playSplashAmbient() {
    if (!this.started) {
      try { this.boot(); } catch { return; }
    }
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.splashMode = true;
    // Light "at sea" wash: gentle ocean rumble + rhythmic surf pulses, with
    // the boat / port / sailing layers held silent.
    this.ramp(this.oceanGain, 0.03);
    this.ramp(this.shoreGain, 0.025);
    this.ramp(this.portGain, 0.0001);
    this.ramp(this.vegetationGain, 0.0001);
    this.ramp(this.fireGain, 0.0001);
    this.ramp(this.hullWashGain, 0.0001);
    this.ramp(this.riggingWindGain, 0.0001);
    this.ramp(this.sailTensionGain, 0.0001);
  }

  update(state: AmbientState) {
    if (!this.started) {
      // Only boot after AudioContext is allowed (post user gesture)
      try { this.boot(); } catch { return; }
    }
    if (!this.ctx || this.ctx.state === 'suspended') {
      this.ctx?.resume();
      return;
    }

    // First in-game update releases the splash lock — from here on, the
    // position-driven gain logic below smoothly takes over.
    if (this.splashMode) this.splashMode = false;

    if (state.paused) return;

    const pos = state.playerMode === 'walking' ? state.walkingPos : state.playerPos;

    // Distance to nearest port
    let minPortDist = Infinity;
    let nearestPort: AmbientState['ports'][number] | undefined;
    for (const port of state.ports) {
      const dx = pos[0] - port.position[0];
      const dz = pos[2] - port.position[2];
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < minPortDist) {
        minPortDist = dist;
        nearestPort = port;
      }
    }
    const nearestPortId = nearestPort?.id;
    const profile = getAmbientProfile(nearestPortId);

    const isWalking = state.playerMode === 'walking';
    const nearShore = minPortDist < 60;
    const terrain = getTerrainData(pos[0], pos[2]);
    const onLand = terrain.height > SEA_LEVEL + 0.25;
    const inlandFactor = Math.max(0, Math.min(1, (minPortDist - 45) / 90));

    // ── Ocean layer: loud at sea, fades near shore, silent when walking
    const oceanTarget = isWalking
      ? 0.0001
      : nearShore
        ? 0.02 * profile.nearOcean * Math.max(0.1, minPortDist / 60)
        : 0.04 + Math.min(0.025, state.speed * 0.006);
    this.ramp(this.oceanGain, oceanTarget);

    // Shift ocean LFO speed subtly with time of day (calmer at dawn/dusk)
    if (this.oceanSources) {
      const hour = state.timeOfDay % 24;
      const dayActivity = 1 - 0.3 * Math.cos(((hour - 12) / 12) * Math.PI);
      this.oceanSources.lfo.frequency.setValueAtTime(0.08 + 0.06 * dayActivity, this.ctx.currentTime);
    }

    // ── Shore layer: audible when approaching land, both modes
    const shoreTarget = minPortDist < 80
      ? profile.shore * (1 - minPortDist / 80) * (isWalking ? (1 - inlandFactor) : 1)
      : 0.0001;
    this.ramp(this.shoreGain, shoreTarget);

    // ── Port hum: only when walking in a port
    const portTarget = isWalking && minPortDist < 30
      ? profile.port * (1 - minPortDist / 30)
      : 0.0001;
    this.ramp(this.portGain, portTarget);

    // ── Inland vegetation: replaces water as the player walks away from quays
    const vegetationBiomeFactor =
      terrain.biome === 'forest' || terrain.biome === 'jungle' ? 1 :
      terrain.biome === 'grassland' || terrain.biome === 'scrubland' || terrain.biome === 'paddy' ? 0.75 :
      terrain.biome === 'desert' ? 0.3 :
      0.45;
    const vegetationTarget = isWalking && onLand
      ? 0.026 * inlandFactor * vegetationBiomeFactor
      : 0.0001;
    this.ramp(this.vegetationGain, vegetationTarget, 2.5);

    if (this.vegetationSources && this.ctx) {
      const filterTarget =
        terrain.biome === 'forest' || terrain.biome === 'jungle' ? 1900 :
        terrain.biome === 'grassland' || terrain.biome === 'paddy' ? 2600 :
        1600;
      this.vegetationSources.filter.frequency.setTargetAtTime(filterTarget, this.ctx.currentTime, 1.5);
    }

    // ── Local scene detail: fire/ember crackle near relevant hinterland props
    let nearestFireDist = Infinity;
    if (isWalking && nearestPort) {
      const scenes = this.getScenesForPort(nearestPort, state.worldSeed);
      for (const scene of scenes) {
        if (!isFireScene(scene.kind)) continue;
        const dx = scene.x - pos[0];
        const dz = scene.z - pos[2];
        nearestFireDist = Math.min(nearestFireDist, Math.sqrt(dx * dx + dz * dz));
      }
    }
    const fireTarget = nearestFireDist < 22
      ? 0.032 * (1 - nearestFireDist / 22)
      : 0.0001;
    this.ramp(this.fireGain, fireTarget, 0.9);

    // ── Sailing layer: hull wash + rigging wind + sail tension
    // All three scale with speed ratio (0 at rest, 1 at full speed)
    const speedRatio = isWalking ? 0 : Math.min(state.speed / 8, 1); // 8 ≈ typical maxSpeed

    // Hull wash — audible from ~20% speed, soft wash of water on hull
    const hullTarget = speedRatio > 0.15
      ? 0.012 + speedRatio * 0.018 // max ~0.03 — very subtle
      : 0.0001;
    this.ramp(this.hullWashGain, hullTarget);

    // Rigging wind — sweep oscillator frequency with speed for pitch shift
    const riggingTarget = speedRatio > 0.25
      ? 0.006 + speedRatio * 0.014 // max ~0.02 — almost subliminal
      : 0.0001;
    this.ramp(this.riggingWindGain, riggingTarget);

    // Sweep the rigging filter frequency: low moan at slow, gentle whistle at fast
    if (this.riggingWindFilter && this.ctx) {
      const freqTarget = 250 + speedRatio * 500; // 250Hz → 750Hz
      this.riggingWindFilter.frequency.setTargetAtTime(freqTarget, this.ctx.currentTime, 1.0);
    }
    // Also sweep the oscillator frequencies slightly
    if (this.riggingWindSources && this.ctx) {
      const baseFreq = 160 + speedRatio * 120;
      this.riggingWindSources.osc1.frequency.setTargetAtTime(baseFreq, this.ctx.currentTime, 1.5);
      this.riggingWindSources.osc2.frequency.setTargetAtTime(baseFreq * 1.08, this.ctx.currentTime, 1.5);
    }

    // Sail tension — only kicks in at higher speeds (canvas under real strain)
    const sailTarget = speedRatio > 0.45
      ? 0.008 + (speedRatio - 0.45) * 0.025 // ramps from 0.008 to ~0.022
      : 0.0001;
    this.ramp(this.sailTensionGain, sailTarget);

    // Make sail flutter faster at higher speeds
    if (this.sailTensionLfoGain && this.ctx) {
      const lfoDepth = 0.3 + speedRatio * 0.3;
      this.sailTensionLfoGain.gain.setTargetAtTime(lfoDepth, this.ctx.currentTime, 0.5);
    }

    // Track rotation for external use
    this.lastRot = state.playerRot;
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master && this.ctx) {
      this.master.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  getVolume() {
    return this.volume;
  }
}

export const ambientEngine = new AmbientEngine();
