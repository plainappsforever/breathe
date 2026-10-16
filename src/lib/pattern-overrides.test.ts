import { DEFAULT_APP_SETTINGS } from '@/db/app-settings';
import type { PatternPrefs } from '@/db/pattern-prefs';

import { applyPatternPrefs, hasGuidanceOverrides } from './pattern-overrides';

const blank: PatternPrefs = { patternId: 'box', target: null, haptics: null, sound: null, fade: null, guidance: null, favorite: false, lastUsedAt: null };

describe('applyPatternPrefs', () => {
  it('returns the global settings when there are no prefs or no overrides', () => {
    expect(applyPatternPrefs(DEFAULT_APP_SETTINGS, null)).toBe(DEFAULT_APP_SETTINGS);
    expect(applyPatternPrefs(DEFAULT_APP_SETTINGS, blank)).toEqual(DEFAULT_APP_SETTINGS);
  });

  it('lets a pattern turn haptics, sound and fade off (or on) for itself only', () => {
    const settings = { ...DEFAULT_APP_SETTINGS, haptics: 'on' as const, sound: true, fadeToDark: true };
    const merged = applyPatternPrefs(settings, { ...blank, haptics: 'off', sound: false, fade: false });
    expect(merged).toMatchObject({ haptics: 'off', sound: false, fadeToDark: false });
    // the strength, volume and everything else stay global
    expect(merged.hapticStrength).toBe(settings.hapticStrength);
    expect(merged.volume).toBe(settings.volume);

    const off = { ...DEFAULT_APP_SETTINGS, haptics: 'off' as const, sound: false, fadeToDark: false };
    expect(applyPatternPrefs(off, { ...blank, haptics: 'on', sound: true, fade: true })).toMatchObject({ haptics: 'on', sound: true, fadeToDark: true });
  });

  it('ignores an unknown stored haptics value', () => {
    expect(applyPatternPrefs(DEFAULT_APP_SETTINGS, { ...blank, haptics: 'gentle' }).haptics).toBe(DEFAULT_APP_SETTINGS.haptics);
  });

  it('reports whether any guidance override is set', () => {
    expect(hasGuidanceOverrides(null)).toBe(false);
    expect(hasGuidanceOverrides(blank)).toBe(false);
    expect(hasGuidanceOverrides({ ...blank, fade: false })).toBe(true);
  });
});
