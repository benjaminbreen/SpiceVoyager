// Music manager — splash track + rotating overworld playlist.
// Crossfades between tracks. Browsers require a user gesture before
// audio can play, so we pre-create elements and retry .play().

// Each entry can carry an optional `zones` array — a list of music-zone
// strings (defined in utils/portCoords.ts: MusicZone). If omitted, the
// track is in the global pool and plays anywhere. If present, the track
// is only eligible while the player's current world port belongs to one
// of the listed zones. Set the active zone via `audioManager.setCurrentZone()`.
interface OverworldTrack {
  src: string;
  gain: number;
  zones?: string[];
}

const OVERWORLD_TRACKS: OverworldTrack[] = [
  { src: '/music/persian-dawn.mp3',         gain: 0.2  },
  { src: '/music/cobblestone-echoes.mp3',   gain: 0.35 },
  { src: '/music/sea-of-tiny-worlds.mp3',   gain: 0.35 },
  { src: '/music/chiptune-worldmap.mp3',    gain: 0.35 },
  { src: '/music/ocean-ambient.mp3',        gain: 0.3  },
  { src: '/music/shiraz-sunset.mp3',        gain: 0.35 },
  { src: '/music/Inn%20Rest.mp3',           gain: 0.35 },
  { src: '/music/After%20the%20Night.mp3',  gain: 0.35 },
  { src: '/music/Pepper%20Caravan.mp3',     gain: 0.35 },
  { src: '/music/Monsoon%20Ledger%20(Asia).mp3', gain: 0.35, zones: ['east-asia'] },
];

const INN_REST_SRC = '/music/Inn%20Rest.mp3';
const AFTER_NIGHT_SRC = '/music/After%20the%20Night.mp3';

class AudioManager {
  private splashTrack: HTMLAudioElement | null = null;
  private overworldTrack: HTMLAudioElement | null = null;
  private overworldTimer: ReturnType<typeof setTimeout> | null = null;
  private splashPlaying = false;
  private musicVolume = 0.10;
  private trackIndex = -1;
  private transitioning = false;
  private fightTrack: HTMLAudioElement | null = null;
  private fightActive = false;
  private savedOverworldVolume = 0;
  private portTrack: HTMLAudioElement | null = null;
  private portTrackSrc: string | null = null;
  private portTrackGain = 0.3;
  private innTrack: HTMLAudioElement | null = null;
  private savedPortVolumeForInn = 0;
  private currentZone: string | null = null;

  playSplash() {
    if (this.splashPlaying) return;
    if (!this.splashTrack) {
      this.splashTrack = new Audio('/music/world-map-other-sky.mp3');
      this.splashTrack.loop = true;
      this.splashTrack.volume = this.musicVolume;
    }
    this.splashTrack.play().then(() => {
      this.splashPlaying = true;
    }).catch(() => {});
  }

  transitionToOverworld() {
    // Fade out splash
    if (this.splashTrack) {
      this.fadeOut(this.splashTrack);
      this.splashTrack = null;
      this.splashPlaying = false;
    }

    // Shuffle starting track from the pool eligible in the current zone
    this.trackIndex = this.pickEligibleTrackIndex();

    // Start first overworld track after delay
    if (this.overworldTimer) clearTimeout(this.overworldTimer);
    this.overworldTimer = setTimeout(() => {
      this.playCurrentTrack();
      this.overworldTimer = null;
    }, 10_000);
  }

  private playCurrentTrack() {
    const entry = OVERWORLD_TRACKS[this.trackIndex];
    const track = new Audio(entry.src);
    track.loop = false;
    track.volume = 0;
    this.overworldTrack = track;

    // When track ends, crossfade to next
    track.addEventListener('ended', () => {
      if (this.overworldTrack === track) {
        this.advanceTrack();
      }
    });

    track.play().catch(() => {});
    this.fadeIn(track, this.musicVolume * entry.gain);
  }

  private advanceTrack() {
    if (this.transitioning) return;
    this.transitioning = true;

    const old = this.overworldTrack;
    // Fade out current
    if (old) {
      this.fadeOut(old, 3, () => {
        old.pause();
        old.src = '';
      });
    }

    // Pick a different eligible track at random (avoids immediate repeat
    // and respects the current music zone)
    this.trackIndex = this.pickEligibleTrackIndex(this.trackIndex);

    // Brief gap, then fade in next
    setTimeout(() => {
      this.playCurrentTrack();
      this.transitioning = false;
    }, 2000);
  }

  /** Pick a random index into OVERWORLD_TRACKS from the subset eligible
   *  in the current zone. Excludes `excludeIdx` if provided (so we don't
   *  immediately repeat the same track). Falls back to the global pool
   *  if zone-restricted picks become impossible. */
  private pickEligibleTrackIndex(excludeIdx?: number): number {
    const eligible: number[] = [];
    for (let i = 0; i < OVERWORLD_TRACKS.length; i++) {
      if (i === excludeIdx) continue;
      const t = OVERWORLD_TRACKS[i];
      if (!t.zones || (this.currentZone && t.zones.includes(this.currentZone))) {
        eligible.push(i);
      }
    }
    if (eligible.length === 0) {
      // Fallback: ignore exclusion if it leaves us empty (e.g. only one
      // eligible track in this zone). Then ignore zones entirely as a
      // last resort to avoid silence.
      const noExclude: number[] = [];
      for (let i = 0; i < OVERWORLD_TRACKS.length; i++) {
        const t = OVERWORLD_TRACKS[i];
        if (!t.zones || (this.currentZone && t.zones.includes(this.currentZone))) {
          noExclude.push(i);
        }
      }
      if (noExclude.length > 0) return noExclude[Math.floor(Math.random() * noExclude.length)];
      return Math.floor(Math.random() * OVERWORLD_TRACKS.length);
    }
    return eligible[Math.floor(Math.random() * eligible.length)];
  }

  /** Set the current music zone — typically called when the player's
   *  world port changes. Tracks tagged with zones become eligible only
   *  while their zone is active. The currently-playing track is allowed
   *  to finish; the next pick will respect the new zone. Pass null to
   *  return to the global pool (e.g. when no port context applies). */
  setCurrentZone(zone: string | null) {
    this.currentZone = zone;
  }

  private getCurrentOverworldTarget() {
    const entry = OVERWORLD_TRACKS[this.trackIndex];
    return entry ? this.musicVolume * entry.gain : this.musicVolume * 0.3;
  }

  // ── Fade helpers ──────────────────────────────────────────────────

  private fadeIn(el: HTMLAudioElement, target: number, duration = 2.5) {
    const step = target / (duration / 0.05);
    const iv = setInterval(() => {
      if (el.volume < target - step) {
        el.volume += step;
      } else {
        el.volume = target;
        clearInterval(iv);
      }
    }, 50);
  }

  private fadeOut(el: HTMLAudioElement, duration = 1.5, onDone?: () => void) {
    const step = el.volume / (duration / 0.05);
    const iv = setInterval(() => {
      if (el.volume > step) {
        el.volume -= step;
      } else {
        el.volume = 0;
        el.pause();
        clearInterval(iv);
        onDone?.();
      }
    }, 50);
  }

  /** Crossfade to fight mode music. Ducks overworld track. */
  startFightMusic() {
    if (this.fightActive) return;
    this.fightActive = true;

    // Duck overworld
    if (this.overworldTrack) {
      this.savedOverworldVolume = this.overworldTrack.volume;
      this.fadeOut(this.overworldTrack, 1.5);
    }

    // Start fight track
    if (!this.fightTrack) {
      this.fightTrack = new Audio('/music/fight-mode.mp3');
      this.fightTrack.loop = true;
    }
    this.fightTrack.volume = 0;
    this.fightTrack.play().catch(() => {});
    this.fadeIn(this.fightTrack, this.musicVolume * 0.35, 1.5);
  }

  /** Crossfade to port music while a port modal is open. */
  startPortMusic(src: string, gain = 0.3) {
    this.portTrackGain = gain;
    if (this.portTrack && this.portTrackSrc === src) return;

    const oldPortTrack = this.portTrack;
    if (oldPortTrack) {
      this.fadeOut(oldPortTrack, 1, () => {
        oldPortTrack.pause();
        oldPortTrack.src = '';
      });
    }

    if (this.overworldTrack && !this.fightActive) {
      this.fadeOut(this.overworldTrack, 1.5);
    }

    const track = new Audio(src);
    track.loop = true;
    track.volume = 0;
    this.portTrack = track;
    this.portTrackSrc = src;
    track.play().catch(() => {});
    this.fadeIn(track, this.musicVolume * gain, 1.8);
  }

  /** Crossfade to the inn / rest-for-the-night track. Ducks port music
   *  underneath. Track file: Inn Rest.mp3. */
  startInnMusic() {
    // Duck port track if playing
    if (this.portTrack) {
      this.savedPortVolumeForInn = this.portTrack.volume;
      this.fadeOut(this.portTrack, 1.5);
    }
    // Also duck overworld track in case the player triggered rest from a
    // dev preview while at sea (no port track playing).
    if (this.overworldTrack && !this.fightActive) {
      this.fadeOut(this.overworldTrack, 1.5);
    }
    if (!this.innTrack) {
      this.innTrack = new Audio(INN_REST_SRC);
      this.innTrack.loop = true;
    }
    this.innTrack.volume = 0;
    this.innTrack.currentTime = 0;
    this.innTrack.play().catch(() => {});
    this.fadeIn(this.innTrack, this.musicVolume * 0.45, 2.0);
  }

  /** Crossfade out of the inn track and bring back the port track. */
  stopInnMusic() {
    if (this.innTrack) {
      const t = this.innTrack;
      this.innTrack = null;
      this.fadeOut(t, 2.0, () => { t.pause(); t.currentTime = 0; });
    }
    if (this.portTrack) {
      this.portTrack.play().catch(() => {});
      this.fadeIn(this.portTrack, this.savedPortVolumeForInn || (this.musicVolume * this.portTrackGain), 2.5);
    }
  }

  /** Crossfade out of the inn track into "After the Night" — the sailing-
   *  away theme. Used when the player closes the port modal after resting.
   *  After this track ends, the normal overworld rotation resumes from
   *  wherever it left off. */
  startAfterNightMusic() {
    // Stop inn track if still playing
    if (this.innTrack) {
      const t = this.innTrack;
      this.innTrack = null;
      this.fadeOut(t, 2.0, () => { t.pause(); t.currentTime = 0; });
    }
    // Stop any port track
    if (this.portTrack) {
      const pt = this.portTrack;
      this.portTrack = null;
      this.portTrackSrc = null;
      this.fadeOut(pt, 1.5, () => { pt.pause(); pt.src = ''; });
    }
    // Suppress the overworld rotation timer — we want After the Night
    // to play uninterrupted, then hand back to the rotation.
    if (this.overworldTimer) {
      clearTimeout(this.overworldTimer);
      this.overworldTimer = null;
    }
    // If an overworld track is currently playing, fade it out first
    if (this.overworldTrack) {
      const old = this.overworldTrack;
      this.overworldTrack = null;
      this.fadeOut(old, 1.8, () => { old.pause(); old.src = ''; });
    }

    const track = new Audio(AFTER_NIGHT_SRC);
    track.loop = false;
    track.volume = 0;
    this.overworldTrack = track;
    // Pick the rotation entry that matches so subsequent volume changes work
    this.trackIndex = OVERWORLD_TRACKS.findIndex(e => e.src === AFTER_NIGHT_SRC);

    track.addEventListener('ended', () => {
      if (this.overworldTrack === track) {
        this.advanceTrack();
      }
    });

    track.play().catch(() => {});
    this.fadeIn(track, this.musicVolume * 0.35, 2.5);
  }

  /** Stop port music and return to the overworld track. */
  stopPortMusic() {
    if (!this.portTrack) return;

    const track = this.portTrack;
    this.portTrack = null;
    this.portTrackSrc = null;
    this.fadeOut(track, 1.5, () => {
      track.pause();
      track.src = '';
    });

    if (!this.fightActive && this.overworldTrack) {
      this.overworldTrack.play().catch(() => {});
      this.fadeIn(this.overworldTrack, this.getCurrentOverworldTarget(), 2.2);
    }
  }

  /** Crossfade back from fight mode music to overworld. */
  stopFightMusic() {
    if (!this.fightActive) return;
    this.fightActive = false;

    // Fade out fight track
    if (this.fightTrack) {
      const track = this.fightTrack;
      this.fadeOut(track, 2, () => {
        track.pause();
        track.currentTime = 0;
      });
    }

    // Restore overworld
    if (this.overworldTrack) {
      const entry = OVERWORLD_TRACKS[this.trackIndex];
      const target = entry ? this.musicVolume * entry.gain : this.musicVolume * 0.3;
      this.overworldTrack.play().catch(() => {});
      this.fadeIn(this.overworldTrack, target, 2.5);
    }
  }

  /** Stop all music (splash + overworld). Used on game over, scene transitions, etc. */
  stopAll() {
    if (this.overworldTimer) {
      clearTimeout(this.overworldTimer);
      this.overworldTimer = null;
    }
    this.transitioning = false;

    if (this.splashTrack) {
      this.fadeOut(this.splashTrack, 1, () => {
        this.splashTrack?.pause();
        this.splashTrack = null;
      });
      this.splashPlaying = false;
    }

    if (this.overworldTrack) {
      const track = this.overworldTrack;
      this.overworldTrack = null;
      this.fadeOut(track, 1.5, () => {
        track.pause();
        track.src = '';
      });
    }

    if (this.fightTrack) {
      const ft = this.fightTrack;
      this.fightTrack = null;
      this.fightActive = false;
      this.fadeOut(ft, 1, () => {
        ft.pause();
        ft.src = '';
      });
    }

    if (this.portTrack) {
      const pt = this.portTrack;
      this.portTrack = null;
      this.portTrackSrc = null;
      this.fadeOut(pt, 1, () => {
        pt.pause();
        pt.src = '';
      });
    }
  }

  // ── Volume control ────────────────────────────────────────────────

  setMusicVolume(v: number) {
    this.musicVolume = Math.max(0, Math.min(1, v));
    if (this.splashTrack) this.splashTrack.volume = this.musicVolume;
    if (this.overworldTrack) {
      const entry = OVERWORLD_TRACKS[this.trackIndex];
      if (entry) this.overworldTrack.volume = this.musicVolume * entry.gain;
    }
    if (this.portTrack) this.portTrack.volume = this.musicVolume * this.portTrackGain;
  }

  getMusicVolume() {
    return this.musicVolume;
  }
}

export const audioManager = new AudioManager();
