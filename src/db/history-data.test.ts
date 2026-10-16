/**
 * @jest-environment node
 */
import { createTestDb } from '../../test/node-sqlite-db';

import { DEFAULT_APP_SETTINGS, getAppSettings, setBoolSetting } from './app-settings';
import { createBackup, readExportSessions, restoreBackup } from './backup';
import { createCustomPattern } from './custom-patterns';
import { migrate } from './migrations';
import { setPatternFavorite, setPatternTarget } from './pattern-prefs';
import {
  countSessionsBetween,
  deleteAllSessions,
  deleteSession,
  deleteSessionsBetween,
  getSession,
  listAllSessions,
  recordSession,
  setSessionMood,
  sumSessionsBetween,
  updateSessionNote,
} from './sessions';
import { setSetting } from './settings';
import { parseBackup, backupToJson, type BackupFile } from '@/lib/export';

const phases = [
  { kind: 'inhale', seconds: 5 },
  { kind: 'exhale', seconds: 5 },
] as const;

const DAY = 24 * 60 * 60 * 1000;

async function freshDb() {
  const db = createTestDb();
  await migrate(db);
  return db;
}

async function addSession(db: Awaited<ReturnType<typeof freshDb>>, startedAt: number, extra: { moodBefore?: number } = {}) {
  const id = await recordSession(
    db,
    { patternName: 'Slow', patternId: 'slow', target: { kind: 'minutes', value: 3 }, phases, plannedSeconds: 180, actualSeconds: 180, breaths: 18, completed: true, ...extra },
    startedAt
  );
  return id!;
}

describe('sumSessionsBetween (widgets: minutes today)', () => {
  it('sums seconds and counts sessions in a range, end exclusive', async () => {
    const db = await freshDb();
    expect(await sumSessionsBetween(db, 0, DAY)).toEqual({ seconds: 0, count: 0 });
    await addSession(db, 10 * DAY + 1000);
    await addSession(db, 10 * DAY + 5000);
    await addSession(db, 11 * DAY);
    expect(await sumSessionsBetween(db, 10 * DAY, 11 * DAY)).toEqual({ seconds: 360, count: 2 });
  });
});

describe('session details', () => {
  it('saves a note, tags and moods on a session', async () => {
    const db = await freshDb();
    const id = await addSession(db, 1000, { moodBefore: 2 });
    expect((await getSession(db, id))?.moodBefore).toBe(2);

    expect(await updateSessionNote(db, id, 'Felt calmer', 'work,lunch')).toBe(true);
    await setSessionMood(db, id, 'after', 4);
    const s = await getSession(db, id);
    expect(s).toMatchObject({ note: 'Felt calmer', tags: 'work,lunch', moodBefore: 2, moodAfter: 4 });

    await setSessionMood(db, id, 'after', null);
    expect((await getSession(db, id))?.moodAfter).toBeNull();
  });

  it('ignores a mood outside 1-5 and a note for a missing session', async () => {
    const db = await freshDb();
    const id = await addSession(db, 1000);
    await setSessionMood(db, id, 'before', 9);
    await setSessionMood(db, id, 'before', 2.5);
    expect((await getSession(db, id))?.moodBefore).toBeNull();
    expect(await updateSessionNote(db, 999, 'x', '')).toBe(false);
    expect(await getSession(db, 999)).toBeNull();
  });

  it('lists every session, newest first (no 50 row cap)', async () => {
    const db = await freshDb();
    for (let i = 0; i < 60; i++) await addSession(db, 1000 + i);
    const all = await listAllSessions(db);
    expect(all).toHaveLength(60);
    expect(all[0].startedAt).toBe(1059);
  });
});

describe('granular delete', () => {
  it('deletes one session, a date range, or everything', async () => {
    const db = await freshDb();
    const a = await addSession(db, 10 * DAY);
    const b = await addSession(db, 11 * DAY);
    await addSession(db, 12 * DAY);
    await addSession(db, 13 * DAY);

    await deleteSession(db, a);
    expect((await listAllSessions(db)).map((s) => s.startedAt)).toEqual([13 * DAY, 12 * DAY, 11 * DAY]);

    expect(await countSessionsBetween(db, 11 * DAY, 13 * DAY)).toBe(2); // end is exclusive
    expect(await deleteSessionsBetween(db, 11 * DAY, 13 * DAY)).toBe(2);
    expect(await getSession(db, b)).toBeNull();
    expect((await listAllSessions(db)).map((s) => s.startedAt)).toEqual([13 * DAY]);

    expect(await deleteAllSessions(db)).toBe(1);
    expect(await listAllSessions(db)).toEqual([]);
  });

  it('keeps settings, patterns and prefs when history is deleted', async () => {
    const db = await freshDb();
    await createCustomPattern(db, { name: 'Mine', values: { inSeconds: 4, sipSeconds: 0, hold1Seconds: 0, outSeconds: 6, hold2Seconds: 0 } });
    await setSetting(db, 'accent', 'teal');
    await addSession(db, 1000);
    await deleteAllSessions(db);
    expect(await db.getAllAsync('SELECT id FROM custom_patterns')).toHaveLength(1);
    expect((await getAppSettings(db)).accent).toBe('teal');
  });
});

describe('P5 settings', () => {
  it('default off, and persist', async () => {
    const db = await freshDb();
    const s = await getAppSettings(db);
    expect([s.moodCheckin, s.milestones, s.historyLock]).toEqual([false, false, false]);
    expect(DEFAULT_APP_SETTINGS.moodCheckin).toBe(false);
    await setBoolSetting(db, 'moodCheckin', true);
    await setBoolSetting(db, 'milestones', true);
    await setBoolSetting(db, 'historyLock', true);
    const on = await getAppSettings(db);
    expect([on.moodCheckin, on.milestones, on.historyLock]).toEqual([true, true, true]);
  });
});

describe('backup and restore', () => {
  async function populated() {
    const db = await freshDb();
    const custom = await createCustomPattern(db, { name: 'Mine', values: { inSeconds: 4, sipSeconds: 0, hold1Seconds: 0, outSeconds: 6, hold2Seconds: 0 } });
    await setPatternFavorite(db, 'box', true);
    await setPatternTarget(db, custom.id, { kind: 'minutes', value: 5 });
    await setSetting(db, 'accent', 'teal');
    await setSetting(db, 'hapticStrength', '0.7');
    await setSetting(db, 'activeSession', '{"unfinished":true}');
    await db.runAsync("INSERT INTO reminders (hour, minute, weekdays, pattern_id, enabled) VALUES (8, 30, '1,2,3', 'slow', 1)");
    const id = await addSession(db, 5 * DAY, { moodBefore: 3 });
    await updateSessionNote(db, id, 'Note, with "quotes"\nand a newline', 'work');
    await setSessionMood(db, id, 'after', 5);
    await addSession(db, 6 * DAY);
    return db;
  }

  it('reads everything except a running session', async () => {
    const db = await populated();
    const backup = await createBackup(db, Date.UTC(2026, 8, 30));
    expect(backup.app).toBe('breathe-well');
    expect(backup.data.settings).toEqual({ accent: 'teal', hapticStrength: '0.7' });
    expect(backup.data.customPatterns).toHaveLength(1);
    expect(backup.data.patternPrefs.map((p) => p.patternId).sort()).toHaveLength(2);
    expect(backup.data.sessions).toHaveLength(2);
    expect(backup.data.sessions[0]).toMatchObject({ note: 'Note, with "quotes"\nand a newline', tags: 'work', moodBefore: 3, moodAfter: 5, target: 'm:3' });
    expect(backup.data.reminders).toEqual([{ hour: 8, minute: 30, weekdays: '1,2,3', patternId: 'slow', enabled: 1 }]);
  });

  it('restores into an empty database exactly, through the JSON text', async () => {
    const source = await populated();
    const text = backupToJson(await createBackup(source));
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const target = await freshDb();
    await addSession(target, 99); // will be replaced
    await setSetting(target, 'accent', 'rose');
    await restoreBackup(target, parsed.backup);

    expect((await createBackup(target, 1)).data).toEqual((await createBackup(source, 1)).data);
    expect(await readExportSessions(target)).toEqual(await readExportSessions(source));
    expect((await getAppSettings(target)).accent).toBe('teal');
    expect(await listAllSessions(target)).toHaveLength(2);
    expect(await db_count(target, 'custom_patterns')).toBe(1);
    expect(await db_count(target, 'reminders')).toBe(1);
    expect(await db_count(target, 'pattern_prefs')).toBe(2);
  });

  it('rolls back completely if something fails half-way', async () => {
    const db = await populated();
    const before = await createBackup(db, 1);
    const broken: BackupFile = {
      ...before,
      data: {
        ...before.data,
        settings: { accent: 'rose' },
        sessions: [],
        // the same key twice breaks the primary key part-way through the restore
        patternPrefs: [
          { patternId: 'x', target: null, haptics: null, sound: null, fade: null, guidance: null, favorite: 0, lastUsedAt: null },
          { patternId: 'x', target: null, haptics: null, sound: null, fade: null, guidance: null, favorite: 0, lastUsedAt: null },
        ],
      },
    };
    await expect(restoreBackup(db, broken)).rejects.toThrow();
    expect(await createBackup(db, 1)).toEqual(before);
    expect(await listAllSessions(db)).toHaveLength(2);
    // the database is still usable after the rollback
    await addSession(db, 7 * DAY);
    expect(await listAllSessions(db)).toHaveLength(3);
  });
});

async function db_count(db: Awaited<ReturnType<typeof freshDb>>, table: string): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`);
  return row?.n ?? 0;
}
