import { NativeModule, requireOptionalNativeModule } from 'expo';

/** One cue from buildSchedule (src/lib/session-schedule.ts): ms since session start, paused time excluded. */
export type RunnerCue = { atMs: number; kind: string; durationMs: number };

export type RunnerOptions = {
  /** Pattern name, shown in the session notification. */
  title: string;
  /** Where the session is now (0 for a fresh start, > 0 when resuming a recovered session). */
  elapsedMs: number;
  /** Countdown end for the notification's progress bar; null for Open. */
  displayEndMs: number | null;
  sound: boolean;
  haptics: 'off' | 'on';
  /** 0.1-1.0, the app's haptic strength slider (same mapping as modules/haptic-pattern). */
  hapticStrength: number;
  /** 0-1: the cue volume slider. */
  volume: number;
  /** Which tone ends the session; 'none' plays no end tone (haptics still play). */
  endSound: 'chime' | 'bell' | 'bowl' | 'none';
  /** A notification End plays the end cue only past this length (the app's saved-session minimum). */
  endCueMinMs: number;
};

/** Pause/Resume/End that came from outside the app: notification, lock screen, headset, or a call. */
export type RunnerActionEvent = { action: 'pause' | 'resume' | 'end'; elapsedMs: number };

declare class SessionRunnerModule extends NativeModule<{ onAction: (event: RunnerActionEvent) => void }> {
  prepare(): void;
  start(cues: RunnerCue[], options: RunnerOptions): void;
  update(cues: RunnerCue[], displayEndMs: number | null): void;
  pause(): void;
  resume(elapsedMs: number): void;
  end(playCue: boolean): void;
  stop(): void;
  isRunning(): boolean;
  /** Android 12+: may reminders fire exactly? (false until the user allows "Alarms & reminders"). */
  canScheduleExactAlarms(): boolean;
  /** Opens the "Alarms & reminders" page for this app; false when the phone has none. */
  openExactAlarmSettings(): boolean;
}

/** Android only (DECISIONS D39); null on iOS and web, where the v1 mechanism stays (D32). */
export default requireOptionalNativeModule<SessionRunnerModule>('SessionRunner');
