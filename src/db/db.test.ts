/**
 * @jest-environment node
 */
import { createTestDb } from '../../test/node-sqlite-db';

import { clearActiveSession, getActiveSession, saveActiveSession, type ActiveSession } from './active-session';
import {
  clampStrength,
  DEFAULT_APP_SETTINGS,
  getAppSettings,
  setBoolSetting,
  setChoiceSetting,
  setHapticStrength,
  setHaptics,
  setPattern,
  setPrepSeconds,
  setTarget,
  setVolume,
} from './app-settings';
import {
  createCustomPattern,
  deleteCustomPattern,
  duplicateCustomPattern,
  getCustomPattern,
  listCustomPatterns,
  migrateLegacyCustomPattern,
  patternExists,
  renameCustomPattern,
  resolvePatternById,
  updateCustomPattern,
} from './custom-patterns';
import { getPatternPrefs, listFavoritePatternIds, listRecentPatternIds, setPatternFavorite, setPatternOverride, setPatternTarget, touchPatternUsed } from './pattern-prefs';
import { LATEST_VERSION, migrate } from './migrations';
import { listRecentSessions, recordSession } from './sessions';
import { getThemePreference, setSetting, setThemePreference } from './settings';

async function freshDb() {
  const db = createTestDb();
  await migrate(db);
  return db;
}

describe('migrations', () => {
  it('reaches the latest version and is safe to run again', async () => {
    const db = await freshDb();
    await migrate(db);
    const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(row?.user_version).toBe(LATEST_VERSION);
  });
});

describe('theme preference', () => {
  it('defaults to system, persists changes, and ignores invalid stored values', async () => {
    const db = await freshDb();
    expect(await getThemePreference(db)).toBe('system');

    await setThemePreference(db, 'dark');
    expect(await getThemePreference(db)).toBe('dark');

    await db.runAsync("UPDATE settings SET value = 'purple' WHERE key = 'theme'");
    expect(await getThemePreference(db)).toBe('system');
  });
});

describe('app settings', () => {
  it('defaults when nothing is stored', async () => {
    const db = await freshDb();
    expect(await getAppSettings(db)).toEqual(DEFAULT_APP_SETTINGS);
  });

  it('persists pattern, duration, haptics and toggles', async () => {
    const db = await freshDb();
    await setPattern(db, 'box');
    await setTarget(db, { kind: 'minutes', value: 5 });
    await setHaptics(db, 'off');
    await setBoolSetting(db, 'sound', false);
    await setBoolSetting(db, 'fadeToDark', false);
    await setBoolSetting(db, 'lockGuidance', true);

    const settings = await getAppSettings(db);
    expect(settings.patternId).toBe('box');
    expect(settings.target).toEqual({ kind: 'minutes', value: 5 });
    expect(settings.haptics).toBe('off');
    expect(settings.sound).toBe(false);
    expect(settings.fadeToDark).toBe(false);
    expect(settings.lockGuidance).toBe(true);
  });

  it('stores breath-count and Open targets, and the prep countdown', async () => {
    const db = await freshDb();
    await setTarget(db, { kind: 'breaths', value: 20 });
    await setPrepSeconds(db, 5);
    let settings = await getAppSettings(db);
    expect(settings.target).toEqual({ kind: 'breaths', value: 20 });
    expect(settings.prepSeconds).toBe(5);

    await setTarget(db, { kind: 'open' });
    await setPattern(db, 'c_abc123');
    settings = await getAppSettings(db);
    expect(settings.target).toEqual({ kind: 'open' });
    expect(settings.patternId).toBe('c_abc123');
  });

  it('ignores invalid stored targets and prep values, and reads the v1 durationMinutes key', async () => {
    const db = await freshDb();
    await setSetting(db, 'target', 'garbage');
    await setSetting(db, 'prepSeconds', '7');
    let settings = await getAppSettings(db);
    expect(settings.target).toEqual(DEFAULT_APP_SETTINGS.target);
    expect(settings.prepSeconds).toBe(0);

    await setSetting(db, 'durationMinutes', 'open');
    expect((await getAppSettings(db)).target).toEqual({ kind: 'open' });
    await setSetting(db, 'durationMinutes', '10');
    expect((await getAppSettings(db)).target).toEqual({ kind: 'minutes', value: 10 });
    await setSetting(db, 'target', 'm:15');
    settings = await getAppSettings(db);
    expect(settings.target).toEqual({ kind: 'minutes', value: 15 });
  });
});

describe('session experience settings (v3 P3)', () => {
  it('defaults: haptics on at the v1 Gentle strength, full volume, chime, 5 s fade, orb, system motion', async () => {
    const settings = await getAppSettings(await freshDb());
    expect(settings).toMatchObject({
      haptics: 'on',
      hapticStrength: 0.45,
      volume: 1,
      endSound: 'chime',
      fadeDelay: 5,
      visual: 'orb',
      reduceMotion: 'system',
      textScale: 'default',
      accent: 'blue',
      shakeToPause: false,
    });
  });

  it('persists every new setting', async () => {
    const db = await freshDb();
    await setHapticStrength(db, 0.7);
    await setVolume(db, 0.35);
    await setChoiceSetting(db, 'endSound', 'bowl');
    await setChoiceSetting(db, 'fadeDelay', 30);
    await setChoiceSetting(db, 'visual', 'ring');
    await setChoiceSetting(db, 'reduceMotion', 'on');
    await setChoiceSetting(db, 'textScale', 'large');
    await setChoiceSetting(db, 'accent', 'violet');
    await setBoolSetting(db, 'shakeToPause', true);
    expect(await getAppSettings(db)).toMatchObject({
      hapticStrength: 0.7,
      volume: 0.35,
      endSound: 'bowl',
      fadeDelay: 30,
      visual: 'ring',
      reduceMotion: 'on',
      textScale: 'large',
      accent: 'violet',
      shakeToPause: true,
    });
  });

  it('keeps strength in 0.1-1.0 and volume in 0-1, and ignores garbage', async () => {
    const db = await freshDb();
    expect(clampStrength(0)).toBe(0.1);
    expect(clampStrength(5)).toBe(1);
    await setHapticStrength(db, 0.02);
    await setVolume(db, 3);
    expect(await getAppSettings(db)).toMatchObject({ hapticStrength: 0.1, volume: 1 });
    await setSetting(db, 'hapticStrength', 'loud');
    await setSetting(db, 'volume', '');
    await setSetting(db, 'endSound', 'gong');
    await setSetting(db, 'fadeDelay', '7');
    await setSetting(db, 'visual', 'cube');
    await setSetting(db, 'accent', 'plaid');
    expect(await getAppSettings(db)).toMatchObject({ hapticStrength: 0.45, volume: 1, endSound: 'chime', fadeDelay: 5, visual: 'orb', accent: 'blue' });
  });

  it('reads v1 haptics values: Gentle is on at 0.45, Strong is on at 0.9, and a saved slider value wins', async () => {
    const db = await freshDb();
    await setSetting(db, 'haptics', 'gentle');
    expect(await getAppSettings(db)).toMatchObject({ haptics: 'on', hapticStrength: 0.45 });
    await setSetting(db, 'haptics', 'strong');
    expect(await getAppSettings(db)).toMatchObject({ haptics: 'on', hapticStrength: 0.9 });
    await setSetting(db, 'haptics', 'off');
    expect(await getAppSettings(db)).toMatchObject({ haptics: 'off' });
    await setSetting(db, 'haptics', 'strong');
    await setHapticStrength(db, 0.3);
    expect(await getAppSettings(db)).toMatchObject({ haptics: 'on', hapticStrength: 0.3 });
  });
});

describe('sessions', () => {
  const phases = [
    { kind: 'inhale' as const, seconds: 4 },
    { kind: 'exhale' as const, seconds: 6 },
  ];

  it('stores a completed session with the right numbers', async () => {
    const db = await freshDb();
    const id = await recordSession(
      db,
      { patternName: 'Slow', phases, plannedSeconds: 180, actualSeconds: 180, breaths: 18, completed: true },
      1_000_000
    );
    expect(id).not.toBeNull();

    const sessions = await listRecentSessions(db);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      patternName: 'Slow',
      phases,
      plannedSeconds: 180,
      actualSeconds: 180,
      breaths: 18,
      completed: true,
    });
  });

  it('does not store sessions shorter than 20 seconds', async () => {
    const db = await freshDb();
    const id = await recordSession(db, {
      patternName: 'Slow',
      phases,
      plannedSeconds: 180,
      actualSeconds: 19,
      breaths: 1,
      completed: false,
    });
    expect(id).toBeNull();
    expect(await listRecentSessions(db)).toHaveLength(0);
  });
});

describe('migration 3', () => {
  it('upgrades a v2 database in place: old sessions survive with empty new columns', async () => {
    const db = createTestDb();
    await db.execAsync(`
      CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
      CREATE TABLE sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, started_at INTEGER NOT NULL, pattern_name TEXT NOT NULL,
        phases TEXT NOT NULL, planned_seconds INTEGER, actual_seconds REAL NOT NULL, breaths INTEGER NOT NULL, completed INTEGER NOT NULL);
      INSERT INTO sessions (started_at, pattern_name, phases, planned_seconds, actual_seconds, breaths, completed)
        VALUES (5, 'Slow', '[{"kind":"inhale","seconds":4},{"kind":"exhale","seconds":6}]', 60, 60, 6, 1);
      PRAGMA user_version = 2;
    `);
    await migrate(db);
    const sessions = await listRecentSessions(db);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ patternName: 'Slow', patternId: null, target: null, note: '', tags: '', moodBefore: null, moodAfter: null, healthSynced: false });
    // New tables exist and are empty.
    for (const table of ['custom_patterns', 'pattern_prefs', 'reminders']) {
      const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`);
      expect(row?.n).toBe(0);
    }
  });
});

describe('migration 4 (v3.1): interrupted sessions', () => {
  it('upgrades a v3 database: old sessions read as not interrupted; new ones store the mark', async () => {
    const db = createTestDb();
    await migrate(db);
    // Simulate a v3 database (user_version 3, no interrupted column) holding one session.
    await db.execAsync(`
      ALTER TABLE sessions DROP COLUMN interrupted;
      INSERT INTO sessions (started_at, pattern_name, phases, planned_seconds, actual_seconds, breaths, completed)
        VALUES (5, 'Slow', '[{"kind":"inhale","seconds":4},{"kind":"exhale","seconds":6}]', 60, 60, 6, 1);
      PRAGMA user_version = 3;
    `);
    await migrate(db);
    const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(row?.user_version).toBe(LATEST_VERSION);
    expect((await listRecentSessions(db))[0]).toMatchObject({ completed: true, interrupted: false });

    const phases = [{ kind: 'inhale' as const, seconds: 4 }, { kind: 'exhale' as const, seconds: 6 }];
    await recordSession(db, { patternName: 'Slow', phases, plannedSeconds: 3600, actualSeconds: 60, breaths: 6, completed: false, interrupted: true }, 10);
    const [latest] = await listRecentSessions(db);
    expect(latest).toMatchObject({ actualSeconds: 60, completed: false, interrupted: true });
  });
});

describe('custom pattern library', () => {
  const values = { inSeconds: 4, sipSeconds: 0, hold1Seconds: 2, outSeconds: 6, hold2Seconds: 0 };

  it('creates, lists, renames, edits, duplicates and deletes', async () => {
    const db = await freshDb();
    const a = await createCustomPattern(db, { name: '  Evening  ', values }, 1000);
    const b = await createCustomPattern(db, { name: '', values: { ...values, hold1Seconds: 0 } }, 2000);
    expect(a.id.startsWith('c_')).toBe(true);
    expect(a.id).not.toBe(b.id);
    expect(a.name).toBe('Evening');
    expect(b.name).toBe('Custom');
    expect((await listCustomPatterns(db)).map((p) => p.name)).toEqual(['Evening', 'Custom']);

    expect(await renameCustomPattern(db, a.id, 'Wind down', 3000)).toBe(true);
    expect(await updateCustomPattern(db, a.id, { values: { ...values, outSeconds: 8 } }, 4000)).toBe(true);
    const edited = await getCustomPattern(db, a.id);
    expect(edited?.name).toBe('Wind down');
    expect(edited?.phases).toEqual([
      { kind: 'inhale', seconds: 4 },
      { kind: 'hold', seconds: 2 },
      { kind: 'exhale', seconds: 8 },
    ]);
    expect(edited?.createdAt).toBe(1000);
    expect(edited?.updatedAt).toBe(4000);
    expect(await renameCustomPattern(db, 'c_missing', 'x')).toBe(false);

    const copy = await duplicateCustomPattern(db, a.id, 5000);
    expect(copy?.name).toBe('Wind down copy');
    expect(copy?.id).not.toBe(a.id);
    expect(copy?.phases).toEqual(edited?.phases);
    expect(await duplicateCustomPattern(db, 'c_missing')).toBeNull();

    await deleteCustomPattern(db, b.id);
    expect((await listCustomPatterns(db)).map((p) => p.name)).toEqual(['Wind down', 'Wind down copy']);
  });

  it('rejects invalid timing without writing anything', async () => {
    const db = await freshDb();
    await expect(createCustomPattern(db, { name: 'Bad', values: { ...values, inSeconds: 0 } })).rejects.toThrow();
    expect(await listCustomPatterns(db)).toHaveLength(0);
    const ok = await createCustomPattern(db, { name: 'Ok', values });
    await expect(updateCustomPattern(db, ok.id, { values: { ...values, inSeconds: 99 } })).rejects.toThrow();
    expect((await getCustomPattern(db, ok.id))?.phases).toHaveLength(3);
  });

  it('deleting the selected pattern falls back to Slow and removes its prefs; history is untouched', async () => {
    const db = await freshDb();
    const p = await createCustomPattern(db, { name: 'Mine', values });
    await setPattern(db, p.id);
    await setPatternTarget(db, p.id, { kind: 'minutes', value: 5 });
    await recordSession(db, { patternName: 'Mine', patternId: p.id, phases: p.phases, plannedSeconds: 60, actualSeconds: 60, breaths: 5, completed: true });
    await deleteCustomPattern(db, p.id);
    expect((await getAppSettings(db)).patternId).toBe('slow');
    expect(await getPatternPrefs(db, p.id)).toBeNull();
    expect(await listRecentSessions(db)).toHaveLength(1);
  });

  it('resolves presets, custom patterns, and unknown ids (to Slow)', async () => {
    const db = await freshDb();
    const p = await createCustomPattern(db, { name: 'Mine', values });
    expect((await resolvePatternById(db, 'box')).name).toBe('Box');
    const custom = await resolvePatternById(db, p.id);
    expect(custom).toMatchObject({ id: p.id, name: 'Mine', hasHolds: true });
    expect((await resolvePatternById(db, 'c_gone')).id).toBe('slow');
    expect(await patternExists(db, 'sigh')).toBe(true);
    expect(await patternExists(db, p.id)).toBe(true);
    expect(await patternExists(db, 'c_gone')).toBe(false);
  });

  it('migrates the single v1 custom pattern into one row named Custom, once', async () => {
    const db = await freshDb();
    await setSetting(db, 'customPattern', JSON.stringify({ inSeconds: 3, sipSeconds: 0, hold1Seconds: 1, outSeconds: 5, hold2Seconds: 0 }));
    await setSetting(db, 'patternId', 'custom');

    const migrated = await migrateLegacyCustomPattern(db);
    expect(migrated?.name).toBe('Custom');
    expect(migrated?.phases).toEqual([
      { kind: 'inhale', seconds: 3 },
      { kind: 'hold', seconds: 1 },
      { kind: 'exhale', seconds: 5 },
    ]);
    expect((await getAppSettings(db)).patternId).toBe(migrated?.id);
    expect(await migrateLegacyCustomPattern(db)).toBeNull();
    expect(await listCustomPatterns(db)).toHaveLength(1);
  });

  it('leaves another selected pattern alone during the v1 migration, and drops unreadable legacy data', async () => {
    const db = await freshDb();
    await setSetting(db, 'customPattern', JSON.stringify({ inSeconds: 4, sipSeconds: 0, hold1Seconds: 0, outSeconds: 6, hold2Seconds: 0 }));
    await setSetting(db, 'patternId', 'box');
    await migrateLegacyCustomPattern(db);
    expect((await getAppSettings(db)).patternId).toBe('box');
    expect(await listCustomPatterns(db)).toHaveLength(1);

    const db2 = await freshDb();
    await setSetting(db2, 'customPattern', '{not json');
    await setSetting(db2, 'patternId', 'custom');
    expect(await migrateLegacyCustomPattern(db2)).toBeNull();
    expect(await listCustomPatterns(db2)).toHaveLength(0);
    expect((await getAppSettings(db2)).patternId).toBe('slow');
  });
});

describe('pattern prefs', () => {
  it('stores a per-pattern default target, and clears it', async () => {
    const db = await freshDb();
    expect(await getPatternPrefs(db, 'box')).toBeNull();
    await setPatternTarget(db, 'box', { kind: 'breaths', value: 10 });
    expect((await getPatternPrefs(db, 'box'))?.target).toEqual({ kind: 'breaths', value: 10 });
    await setPatternTarget(db, 'box', { kind: 'open' });
    expect((await getPatternPrefs(db, 'box'))?.target).toEqual({ kind: 'open' });
    await setPatternTarget(db, 'box', null);
    expect(await getPatternPrefs(db, 'box')).toMatchObject({ target: null, favorite: false, lastUsedAt: null, haptics: null, sound: null, fade: null, guidance: null });
  });

  it('lists at most 3 recently used patterns, newest first, ignoring unused ones', async () => {
    const db = await freshDb();
    await setPatternFavorite(db, 'even', true);
    expect(await listRecentPatternIds(db)).toEqual([]);
    await touchPatternUsed(db, 'slow', 100);
    await touchPatternUsed(db, 'box', 200);
    await touchPatternUsed(db, 'sigh', 300);
    await touchPatternUsed(db, '4-7-8', 400);
    expect(await listRecentPatternIds(db)).toEqual(['4-7-8', 'sigh', 'box']);
    await touchPatternUsed(db, 'slow', 500);
    expect(await listRecentPatternIds(db)).toEqual(['slow', '4-7-8', 'sigh']);
    expect(await listRecentPatternIds(db, 1)).toEqual(['slow']);
    expect((await getPatternPrefs(db, 'even'))?.favorite).toBe(true);
  });
});

describe('favourite patterns', () => {
  it('lists favourites, adds and removes them, and keeps other prefs', async () => {
    const db = await freshDb();
    expect(await listFavoritePatternIds(db)).toEqual([]);
    await setPatternTarget(db, 'box', { kind: 'minutes', value: 5 });
    await setPatternFavorite(db, 'long-exhale', true);
    await setPatternFavorite(db, 'box', true);
    await setPatternFavorite(db, 'c_mine', true);
    expect(await listFavoritePatternIds(db)).toEqual(['box', 'c_mine', 'long-exhale']);
    await setPatternFavorite(db, 'box', false);
    expect(await listFavoritePatternIds(db)).toEqual(['c_mine', 'long-exhale']);
    expect((await getPatternPrefs(db, 'box'))?.target).toEqual({ kind: 'minutes', value: 5 });
  });
});

describe('per-pattern guidance overrides', () => {
  it('stores, reads back and clears haptics, sound and fade overrides without touching the length', async () => {
    const db = await freshDb();
    await setPatternTarget(db, 'box', { kind: 'minutes', value: 10 });
    await setPatternOverride(db, 'box', 'haptics', 'off');
    await setPatternOverride(db, 'box', 'sound', false);
    await setPatternOverride(db, 'box', 'fade', true);
    expect(await getPatternPrefs(db, 'box')).toMatchObject({ target: { kind: 'minutes', value: 10 }, haptics: 'off', sound: false, fade: true });

    await setPatternOverride(db, 'box', 'haptics', 'on');
    await setPatternOverride(db, 'box', 'sound', true);
    expect(await getPatternPrefs(db, 'box')).toMatchObject({ haptics: 'on', sound: true, fade: true });

    await setPatternOverride(db, 'box', 'haptics', null);
    await setPatternOverride(db, 'box', 'sound', null);
    await setPatternOverride(db, 'box', 'fade', null);
    expect(await getPatternPrefs(db, 'box')).toMatchObject({ target: { kind: 'minutes', value: 10 }, haptics: null, sound: null, fade: null });
  });

  it('works for a pattern that has no row yet, and other patterns are unaffected', async () => {
    const db = await freshDb();
    await setPatternOverride(db, 'slow', 'fade', false);
    expect(await getPatternPrefs(db, 'slow')).toMatchObject({ fade: false, haptics: null, sound: null });
    expect(await getPatternPrefs(db, 'box')).toBeNull();
  });
});

describe('session recording with v3 fields', () => {
  it('stores pattern id and target', async () => {
    const db = await freshDb();
    const phases = [{ kind: 'inhale' as const, seconds: 4 }, { kind: 'exhale' as const, seconds: 6 }];
    await recordSession(db, { patternName: 'Slow', patternId: 'slow', target: { kind: 'breaths', value: 6 }, phases, plannedSeconds: 60, actualSeconds: 60, breaths: 6, completed: true });
    const [s] = await listRecentSessions(db);
    expect(s).toMatchObject({ patternId: 'slow', target: { kind: 'breaths', value: 6 }, note: '', tags: '' });
  });
});

describe('active session persistence', () => {
  const active: ActiveSession = {
    patternId: 'slow',
    patternName: 'Slow',
    phases: [{ kind: 'inhale', seconds: 4 }, { kind: 'exhale', seconds: 6 }],
    target: 'm:3',
    startedAt: 1000,
    startTime: 1000,
    pausedElapsedMs: null,
    pausedAt: null,
  };

  it('round-trips, overwrites, clears, and ignores corrupt values', async () => {
    const db = await freshDb();
    expect(await getActiveSession(db)).toBeNull();
    await saveActiveSession(db, active);
    expect(await getActiveSession(db)).toEqual(active);
    await saveActiveSession(db, { ...active, pausedElapsedMs: 5000, pausedAt: 9000 });
    expect((await getActiveSession(db))?.pausedElapsedMs).toBe(5000);
    await clearActiveSession(db);
    expect(await getActiveSession(db)).toBeNull();
    await setSetting(db, 'activeSession', '{"nope":1}');
    expect(await getActiveSession(db)).toBeNull();
    await setSetting(db, 'activeSession', 'not json');
    expect(await getActiveSession(db)).toBeNull();
  });

  it('clearing reports whether this call removed the record, so two concurrent loads save it once (REVIEW_V3 #11)', async () => {
    const db = await freshDb();
    await saveActiveSession(db, active);
    const [first, second] = await Promise.all([clearActiveSession(db), clearActiveSession(db)]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(await clearActiveSession(db)).toBe(false);
  });
});
