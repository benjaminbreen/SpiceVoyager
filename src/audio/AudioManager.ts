// Music manager — splash track + rotating overworld playlist.
// Crossfades between tracks. Browsers require a user gesture before
// audio can play, so we pre-create elements and retry .play().

const OVERWORLD_TRACKS = [
  { src: '/music/persian-dawn.mp3',        gain: 0.2  }, // mastered hot
  { src: '/music/cobblestone-echoes.mp3',   gain: 0.35 },
  { src: '/music/sea-of-tiny-worlds.mp3',   gain: 0.35 },
  { src: '/music/chiptune-worldmap.mp3',    gain: 0.35 },
  { src: '/music/ocean-ambient.mp3',        gain: 0.3  },
  { src: '/music/shiraz-sunset.mp3',       gain: 0.35 },
];

class AudioManager {
  private splashTrack: HTMLAudioElement | null = null;
  private overworldTrack: HTMLAudioElement | null = null;
  private overworldTimer: ReturnType<typeof setTimeout> | null = null;
  private splashPlaying = false;
  private musicVolume = 0.15;
  private trackIndex = -1;
  private transitioning = false;
  private fightTrack: HTMLAudioElement | null = null;
  private fightActive = false;
  private savedOverworldVolume = 0;
  private portTrack: HTMLAudioElement | null = null;
  private portTrackSrc: string | null = null;
  private portTrackGain = 0.3;

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

    // Shuffle starting track
    this.trackIndex = Math.floor(Math.random() * OVERWORLD_TRACKS.length);

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

    // Move to next track
    this.trackIndex = (this.trackIndex + 1) % OVERWORLD_TRACKS.length;

    // Brief gap, then fade in next
    setTimeout(() => {
      this.playCurrentTrack();
      this.transitioning = false;
    }, 2000);
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
