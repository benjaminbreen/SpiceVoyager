// Generative ambient soundscape — three layers crossfaded by game state.
// All synthesis runs on the Web Audio thread; the main thread only sets
// gain targets every ~500ms via exponentialRampToValueAtTime.

interface AmbientState {
  playerMode: 'ship' | 'walking';
  playerPos: [number, number, number];
  walkingPos: [number, number, number];
  ports: { position: [number, number, number] }[];
  speed: number;
  playerRot: number;
  timeOfDay: number;
  paused: boolean;
}

class AmbientEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private volume = 0.3;
  private started = false;

  // Layer gains
  private oceanGain: GainNode | null = null;
  private shoreGain: GainNode | null = null;
  private portGain: GainNode | null = null;
  private wakeGain: GainNode | null = null;
  private wakeFilter: BiquadFilterNode | null = null;

  // Source nodes (kept alive for the lifetime of the engine)
  private oceanSources: { noise: AudioBufferSourceNode; lfo: OscillatorNode } | null = null;
  private shoreSources: { noise: AudioBufferSourceNode; lfoGain: GainNode } | null = null;
  private portSources: { osc1: OscillatorNode; osc2: OscillatorNode; osc3: OscillatorNode } | null = null;

  // Rotation tracking for wake/splash
  private lastRot = 0;

  private userHasInteracted = false;

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
    this.buildWake();
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

  // ── Wake: splashy high-frequency burst that responds to turning ────

  private buildWake() {
    const ac = this.ctx!;
    // White noise through a highpass = splashy, bright character
    const len = ac.sampleRate * 2;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    // Highpass removes the low rumble, leaving the splashy top end
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 800;
    hp.Q.value = 0.3;

    // Gentle peak for water-rush character
    const bp = ac.createBiquadFilter();
    bp.type = 'peaking';
    bp.frequency.value = 2500;
    bp.gain.value = 2;
    bp.Q.value = 1.2;
    this.wakeFilter = bp;

    this.wakeGain = ac.createGain();
    this.wakeGain.gain.value = 0.0001;

    src.connect(hp).connect(bp).connect(this.wakeGain).connect(this.master!);
    src.start();
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

  // ── Public API ────────────────────────────────────────────────────

  update(state: AmbientState) {
    if (!this.started) {
      // Only boot after AudioContext is allowed (post user gesture)
      try { this.boot(); } catch { return; }
    }
    if (!this.ctx || this.ctx.state === 'suspended') {
      this.ctx?.resume();
      return;
    }

    if (state.paused) return;

    const pos = state.playerMode === 'walking' ? state.walkingPos : state.playerPos;

    // Distance to nearest port
    let minPortDist = Infinity;
    for (const port of state.ports) {
      const dx = pos[0] - port.position[0];
      const dz = pos[2] - port.position[2];
      minPortDist = Math.min(minPortDist, Math.sqrt(dx * dx + dz * dz));
    }

    const isWalking = state.playerMode === 'walking';
    const nearShore = minPortDist < 60;

    // ── Ocean layer: loud at sea, fades near shore, silent when walking
    const oceanTarget = isWalking
      ? 0.0001
      : nearShore
        ? 0.03 * Math.max(0.1, minPortDist / 60)
        : 0.06 + Math.min(0.04, state.speed * 0.008);
    this.ramp(this.oceanGain, oceanTarget);

    // Shift ocean LFO speed subtly with time of day (calmer at dawn/dusk)
    if (this.oceanSources) {
      const hour = state.timeOfDay % 24;
      const dayActivity = 1 - 0.3 * Math.cos(((hour - 12) / 12) * Math.PI);
      this.oceanSources.lfo.frequency.setValueAtTime(0.08 + 0.06 * dayActivity, this.ctx.currentTime);
    }

    // ── Shore layer: audible when approaching land, both modes
    const shoreTarget = minPortDist < 80
      ? 0.05 * (1 - minPortDist / 80)
      : 0.0001;
    this.ramp(this.shoreGain, shoreTarget);

    // ── Port hum: only when walking in a port
    const portTarget = isWalking && minPortDist < 30
      ? 0.04 * (1 - minPortDist / 30)
      : 0.0001;
    this.ramp(this.portGain, portTarget);

    // ── Wake/splash: responds to turning and speed while sailing
    if (!isWalking) {
      // Compute rotation delta (handle wraparound)
      let rotDelta = Math.abs(state.playerRot - this.lastRot);
      if (rotDelta > Math.PI) rotDelta = 2 * Math.PI - rotDelta;
      this.lastRot = state.playerRot;

      // turnIntensity: 0 = straight, ~1 = hard turn
      const turnIntensity = Math.min(1, rotDelta * 6);
      const speedFactor = Math.min(1, state.speed * 0.15);
      const wakeTarget = 0.007 * turnIntensity * speedFactor;
      this.ramp(this.wakeGain, Math.max(0.0001, wakeTarget), turnIntensity > 0.05 ? 0.08 : 0.15);

      // Shift the peak frequency up during hard turns
      if (this.wakeFilter && this.ctx) {
        const freq = 2500 + turnIntensity * 1000;
        this.wakeFilter.frequency.setValueAtTime(freq, this.ctx.currentTime);
      }
    } else {
      this.ramp(this.wakeGain, 0.0001);
      this.lastRot = state.playerRot;
    }
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
