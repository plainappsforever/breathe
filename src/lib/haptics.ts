import * as ExpoHaptics from 'expo-haptics';

import HapticPatternNative from '../../modules/haptic-pattern/src/HapticPatternModule';
import { resolveStrength, type HapticCapabilities } from '../../modules/haptic-pattern/src/HapticPattern.types';
import type { HapticsLevel } from '@/db/app-settings';

import type { PhaseKind } from './patterns';

let capabilitiesCache: HapticCapabilities | null = null;

/** capabilities().ramps is false on hardware without amplitude control (D9 fallback). */
export function hapticCapabilities(): HapticCapabilities {
  if (!capabilitiesCache) {
    try {
      capabilitiesCache = HapticPatternNative.capabilities();
    } catch {
      capabilitiesCache = { ramps: false };
    }
  }
  return capabilitiesCache;
}

/** Fallback taps (no ramp support): a light, medium or heavy tap by strength. */
function tapStyle(strength: number): ExpoHaptics.ImpactFeedbackStyle {
  if (strength < 0.4) return ExpoHaptics.ImpactFeedbackStyle.Light;
  return strength < 0.75 ? ExpoHaptics.ImpactFeedbackStyle.Medium : ExpoHaptics.ImpactFeedbackStyle.Heavy;
}

/** Continuous swell (inhale) / fade (exhale) for the duration of the phase, SPEC "Running session". */
export function playPhaseHaptic(kind: PhaseKind, durationMs: number, level: HapticsLevel, strengthSetting: number): void {
  if (level === 'off') return;
  const strength = resolveStrength(strengthSetting);

  if (kind === 'inhale' || kind === 'exhale') {
    if (hapticCapabilities().ramps) {
      try {
        HapticPatternNative.play(kind, Math.min(durationMs, 30000), strength);
        return;
      } catch {
        // fall through to the tap fallback below
      }
    }
    ExpoHaptics.impactAsync(kind === 'inhale' ? tapStyle(strength) : ExpoHaptics.ImpactFeedbackStyle.Light);
    return;
  }

  if (kind === 'sip') {
    try {
      HapticPatternNative.play('sip', 60, strength);
    } catch {
      ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Light);
    }
  }
}

/** One soft tick at hold start; call again ~1s before the hold ends for the lighter tick (SPEC). */
export function playHoldTick(edge: 'start' | 'end', level: HapticsLevel, strengthSetting: number): void {
  if (level === 'off') return;
  const strength = resolveStrength(strengthSetting);
  try {
    HapticPatternNative.play(edge === 'start' ? 'holdStart' : 'holdEnd', edge === 'start' ? 40 : 30, strength);
  } catch {
    ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Soft);
  }
}

/** Three rising taps at session end (SPEC "Running session"). */
export function playEndHaptic(level: HapticsLevel, strengthSetting: number): void {
  if (level === 'off') return;
  try {
    HapticPatternNative.play('end', 450, resolveStrength(strengthSetting));
  } catch {
    ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Success);
  }
}

export function stopHaptics(): void {
  try {
    HapticPatternNative.stop();
  } catch {
    // no-op: nothing to stop
  }
}
