import type { AppSettings, HapticsLevel } from '@/db/app-settings';
import type { PatternPrefs } from '@/db/pattern-prefs';

/**
 * The settings a session actually uses: the global settings, with the pattern's own haptics / sound /
 * fade overrides on top (V3 P3: "session presets = a pattern with its prefs"). null = follow the global
 * setting. The length override (`target`) is applied where the pattern is chosen, not here.
 */
export function applyPatternPrefs(settings: AppSettings, prefs: PatternPrefs | null): AppSettings {
  if (!prefs) return settings;
  const haptics: HapticsLevel = prefs.haptics === 'off' || prefs.haptics === 'on' ? prefs.haptics : settings.haptics;
  return {
    ...settings,
    haptics,
    sound: prefs.sound ?? settings.sound,
    fadeToDark: prefs.fade ?? settings.fadeToDark,
  };
}

/** True when the pattern overrides anything besides its length. */
export function hasGuidanceOverrides(prefs: PatternPrefs | null): boolean {
  return !!prefs && (prefs.haptics !== null || prefs.sound !== null || prefs.fade !== null);
}
