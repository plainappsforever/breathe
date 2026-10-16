import { Platform } from 'react-native';

import SessionRunnerNative from '../../modules/session-runner/src/SessionRunnerModule';

export type { RunnerActionEvent, RunnerCue, RunnerOptions } from '../../modules/session-runner/src/SessionRunnerModule';
export type SessionRunner = NonNullable<typeof SessionRunnerNative>;

/**
 * Android with "Keep guiding when locked" on: the native runner owns every cue (tones + vibration),
 * foreground and background, and JS only draws (V3_PLAN "Android locked mode", DECISIONS D39).
 * Everywhere else the v1 JS-driven cues stay (iOS keeps them while locked, D32).
 */
export function usesNativeRunner(os: string, lockGuidance: boolean, moduleAvailable: boolean): boolean {
  return os === 'android' && lockGuidance && moduleAvailable;
}

/** The runner to use for a session, or null for JS-driven cues. */
export function nativeRunnerFor(lockGuidance: boolean): SessionRunner | null {
  return usesNativeRunner(Platform.OS, lockGuidance, SessionRunnerNative != null) ? SessionRunnerNative : null;
}

/** The module itself when present (Android), for subscribing to its events. */
export const sessionRunnerModule: SessionRunner | null = Platform.OS === 'android' ? SessionRunnerNative : null;
