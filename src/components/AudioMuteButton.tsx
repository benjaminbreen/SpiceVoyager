import { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { audioManager } from '../audio/AudioManager';
import { ambientEngine } from '../audio/AmbientEngine';
import { getSfxVolume, setSfxVolume, sfxClick, sfxHover } from '../audio/SoundEffects';

const MUTE_KEY = 'spice-voyager-audio-muted';
const VOLUME_KEY = 'spice-voyager-audio-volumes';

type SavedVolumes = {
  music: number;
  ambient: number;
  sfx: number;
};

function readMuted() {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(MUTE_KEY) === '1';
}

function readSavedVolumes(): SavedVolumes {
  if (typeof window === 'undefined') {
    return { music: audioManager.getMusicVolume(), ambient: ambientEngine.getVolume(), sfx: getSfxVolume() };
  }

  const raw = window.localStorage.getItem(VOLUME_KEY);
  if (!raw) return { music: 0.1, ambient: 0.3, sfx: 0.5 };
  try {
    const parsed = JSON.parse(raw) as Partial<SavedVolumes>;
    return {
      music: clampVolume(parsed.music ?? 0.1),
      ambient: clampVolume(parsed.ambient ?? 0.3),
      sfx: clampVolume(parsed.sfx ?? 0.5),
    };
  } catch {
    return { music: 0.1, ambient: 0.3, sfx: 0.5 };
  }
}

function saveVolumes(volumes: SavedVolumes) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(VOLUME_KEY, JSON.stringify(volumes));
}

function clampVolume(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function currentVolumes(): SavedVolumes {
  return {
    music: audioManager.getMusicVolume(),
    ambient: ambientEngine.getVolume(),
    sfx: getSfxVolume(),
  };
}

function applyVolumes(volumes: SavedVolumes) {
  audioManager.setMusicVolume(volumes.music);
  ambientEngine.setVolume(volumes.ambient);
  setSfxVolume(volumes.sfx);
}

function setMutedStorage(muted: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
}

export function AudioMuteButton({
  variant = 'hud',
  showLabel = false,
}: {
  variant?: 'hud' | 'splash';
  showLabel?: boolean;
}) {
  const [muted, setMuted] = useState(readMuted);

  useEffect(() => {
    if (muted) {
      applyVolumes({ music: 0, ambient: 0, sfx: 0 });
    }
  }, [muted]);

  const toggle = () => {
    const nextMuted = !muted;
    if (nextMuted) {
      saveVolumes(currentVolumes());
      applyVolumes({ music: 0, ambient: 0, sfx: 0 });
    } else {
      const saved = readSavedVolumes();
      applyVolumes(saved);
      sfxClick();
    }
    setMutedStorage(nextMuted);
    setMuted(nextMuted);
  };

  const Icon = muted ? VolumeX : Volume2;
  const label = muted ? 'Unmute' : 'Mute';

  if (variant === 'splash') {
    return (
      <button
        type="button"
        onClick={toggle}
        title={label}
        aria-label={label}
        onMouseEnter={() => { if (!muted) sfxHover(); }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 38,
          padding: showLabel ? '0 14px' : '0 11px',
          borderRadius: 19,
          background: muted ? 'rgba(70, 25, 25, 0.52)' : 'rgba(20, 30, 45, 0.42)',
          border: muted ? '1px solid rgba(248,113,113,0.45)' : '1px solid rgba(255,248,232,0.22)',
          color: muted ? 'rgba(252,165,165,0.95)' : 'rgba(255,248,232,0.88)',
          fontFamily: '"Manrope", "Inter", system-ui, sans-serif',
          fontSize: 12.5,
          fontWeight: 600,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          backdropFilter: 'blur(10px)',
          boxShadow: '0 6px 14px rgba(0,5,15,0.35)',
        }}
      >
        <Icon size={18} strokeWidth={2.2} />
        {showLabel && <span>{label}</span>}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      onMouseEnter={() => { if (!muted) sfxHover(); }}
      aria-pressed={muted}
      aria-label={label}
      title={label}
      className={`group relative w-11 h-11 rounded-full flex items-center justify-center
        bg-[#1a1e2e] border-2
        shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),inset_0_-1px_2px_rgba(255,255,255,0.05),0_2px_8px_rgba(0,0,0,0.6)]
        transition-all active:scale-95
        ${muted
          ? 'border-red-400/55 text-red-300 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),0_0_12px_rgba(248,113,113,0.22)]'
          : 'border-[#4a4535]/60 text-[#8a8060] hover:text-amber-300 hover:border-amber-600/50'
        }`}
    >
      <Icon size={16} />
      <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-[#0b1120] border border-slate-700/50 rounded text-[9px] tracking-[0.12em] uppercase text-slate-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        {label}
      </span>
    </button>
  );
}
