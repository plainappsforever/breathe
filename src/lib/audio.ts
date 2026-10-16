import { createAudioPlayer, setAudioModeAsync, setIsAudioActiveAsync, type AudioPlayer } from 'expo-audio';

import type { EndSound } from '@/db/app-settings';

import type { PhaseKind } from './patterns';

const SOUND_FILES = {
  inhale: require('../../assets/sounds/inhale.wav'),
  exhale: require('../../assets/sounds/exhale.wav'),
  hold: require('../../assets/sounds/hold.wav'),
  sip: require('../../assets/sounds/sip.wav'),
  end: require('../../assets/sounds/end.wav'),
} as const;

/** The end tone the user picked ('chime' is the v1 three-note tone, end.wav); 'none' has no file. */
const END_FILES = {
  chime: SOUND_FILES.end,
  bell: require('../../assets/sounds/bell.wav'),
  bowl: require('../../assets/sounds/bowl.wav'),
} as const;

const AMBIENT_FILE = require('../../assets/sounds/ambient.wav');

export type CueKind = keyof typeof SOUND_FILES;

export function cueForPhase(kind: PhaseKind): CueKind {
  if (kind === 'inhale') return 'inhale';
  if (kind === 'exhale') return 'exhale';
  if (kind === 'sip') return 'sip';
  return 'hold';
}

/** D21: foreground sessions respect the silent switch/mute; "keep guiding when locked" overrides this. */
export function setForegroundAudioMode(): Promise<void> {
  return setAudioModeAsync({ playsInSilentMode: false, shouldPlayInBackground: false, interruptionMode: 'mixWithOthers' });
}

/** D11: lets cues (and, via the OS, JS timers) keep running once the phone locks or backgrounds. */
export function setBackgroundAudioMode(): Promise<void> {
  return setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'mixWithOthers' });
}

/**
 * After a session (and after a long pause): back to the foreground mode and let the audio session go, so iOS
 * suspends the app instead of keeping it running in the background (REVIEW_V3 #1, guideline 2.5.4). Call it only
 * once nothing of the session plays any more (the end tone has finished); deactivating pauses every player.
 */
export async function endBackgroundAudio(): Promise<void> {
  await setForegroundAudioMode().catch(() => {});
  await setIsAudioActiveAsync(false).catch(() => {});
  if (__DEV__) console.log('[audio] background audio released, audio session inactive');
}

/** Longest end tone (the bowl, 4.4 s) plus a margin: how long the end of a session may still sound. */
export const END_TONE_TAIL_MS = 5000;

function clampVolume(volume: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 1));
}

/** One-off sample for the Settings sliders and end-sound picker. Frees its player after the sound is done. */
export function playSample(sound: 'inhale' | EndSound, volume: number): void {
  if (sound === 'none') return;
  try {
    const player = createAudioPlayer(sound === 'inhale' ? SOUND_FILES.inhale : END_FILES[sound]);
    player.volume = clampVolume(volume);
    player.play();
    setTimeout(() => player.remove(), 6000);
  } catch {
    // a missing preview is not worth an error
  }
}

/** Preloaded cue players for one session, so playback has no per-cue load latency (BUILD_PROMPT Phase 4). */
export class SessionCues {
  private players: Partial<Record<CueKind, AudioPlayer>> = {};
  private ambient: AudioPlayer | null = null;
  private ambientSub: { remove(): void } | null = null;
  private interruptTimer: ReturnType<typeof setTimeout> | null = null;
  private ambientArgs: { title: string; artist: string; onInterrupted?: () => void } | null = null;

  /** volume: the cue volume setting (0-1), applied to every cue player; endSound: which end tone to load. */
  preload(volume = 1, endSound: EndSound = 'chime'): void {
    for (const key of Object.keys(SOUND_FILES) as CueKind[]) {
      if (key === 'end') {
        if (endSound === 'none') continue;
        this.players.end = createAudioPlayer(END_FILES[endSound]);
      } else {
        this.players[key] = createAudioPlayer(SOUND_FILES[key]);
      }
      const player = this.players[key];
      if (player) player.volume = clampVolume(volume);
    }
  }

  play(kind: CueKind): void {
    const player = this.players[kind];
    if (!player) return;
    player.seekTo(0).catch(() => {});
    player.play();
  }

  /** Cuts off whatever is currently playing (SPEC: "haptics/sound stop" on pause). */
  stopAll(): void {
    for (const player of Object.values(this.players)) player?.pause();
  }

  /**
   * Near-silent looping bed that keeps the audio session (and background execution) alive, D11.
   * onInterrupted: called when the OS stops the bed by itself (an incoming call on iOS), so the session
   * can pause; there is no auto-resume (D39). The 1 s debounce ignores momentary loop-point states.
   */
  startAmbient(title: string, artist: string, onInterrupted?: () => void): void {
    this.ambientArgs = { title, artist, onInterrupted };
    if (this.ambient) return;
    const player = createAudioPlayer(AMBIENT_FILE);
    player.loop = true;
    player.volume = 1; // the WAV itself is recorded at ~-40dB; this is not the session's real volume
    player.play();
    this.ambient = player;
    if (onInterrupted) {
      this.ambientSub = player.addListener('playbackStatusUpdate', (status) => {
        if (status.playing || !status.isLoaded || this.interruptTimer) return;
        this.interruptTimer = setTimeout(() => {
          this.interruptTimer = null;
          if (this.ambient === player && !player.playing) onInterrupted();
        }, 1000);
      });
    }
    try {
      player.setActiveForLockScreen(true, { title, artist });
    } catch {
      // Lock-screen controls are best-effort (Android only; needs doNotMix to be fully reliable per
      // expo-audio's own docs, which conflicts with mixWithOthers here) — cues still play either way.
    }
  }

  /** True while the keep-alive bed exists (it may be stopped by an interruption). */
  get hasAmbient(): boolean {
    return this.ambient !== null;
  }

  /** Restarts the bed after an interruption stopped it, or after a long pause removed it (the user tapped Resume). */
  resumeAmbient(): void {
    if (this.ambient) {
      if (!this.ambient.playing) this.ambient.play();
      return;
    }
    const args = this.ambientArgs;
    if (!args) return;
    setBackgroundAudioMode().catch(() => {});
    this.startAmbient(args.title, args.artist, args.onInterrupted);
  }

  stopAmbient(): void {
    if (this.interruptTimer) clearTimeout(this.interruptTimer);
    this.interruptTimer = null;
    this.ambientSub?.remove();
    this.ambientSub = null;
    if (!this.ambient) return;
    try {
      this.ambient.clearLockScreenControls();
    } catch {
      // best-effort
    }
    // remove() alone frees the JS object but leaves the AVPlayer looping (seen in the simulator's audio log, v3.1 F1).
    this.ambient.pause();
    this.ambient.remove();
    this.ambient = null;
  }

  release(): void {
    for (const player of Object.values(this.players)) {
      player?.pause();
      player?.remove();
    }
    this.players = {};
    this.ambientArgs = null;
    this.stopAmbient();
  }
}
