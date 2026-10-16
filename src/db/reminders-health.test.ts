/**
 * @jest-environment node
 */
import { createTestDb } from '../../test/node-sqlite-db';

import { MAX_REMINDERS } from '@/lib/reminders';
import { healthTitle, markHealthSynced, pendingHealthSessions, syncPendingToHealth } from '@/lib/health-sync';
import { TRANSIENT_SETTING_KEYS } from '@/lib/export';

import { DEFAULT_APP_SETTINGS, getAppSettings, setHealthSync } from './app-settings';
import { createBackup, restoreBackup } from './backup';
import { migrate } from './migrations';
import { addReminder, deleteReminder, listReminders, updateReminder } from './reminders';
import { getSession, recordSession } from './sessions';
import { setSetting } from './settings';

const phases = [
  { kind: 'inhale', seconds: 5 },
  { kind: 'exhale', seconds: 5 },
] as const;

async function freshDb() {
  const db = createTestDb();
  await migrate(db);
  return db;
}

async function addSession(db: Awaited<ReturnType<typeof freshDb>>, startedAt: number, actualSeconds = 180) {
  return (await recordSession(
    db,
    { patternName: 'Slow', patternId: 'slow', target: { kind: 'minutes', value: 3 }, phases, plannedSeconds: 180, actualSeconds, breaths: 18, completed: true },
    startedAt
  ))!;
}

describe('reminders table', () => {
  it('starts empty: no reminder exists by default', async () => {
    expect(await listReminders(await freshDb())).toEqual([]);
  });

  it('adds, orders by time, updates and deletes', async () => {
    const db = await freshDb();
    const late = await addReminder(db, { hour: 21, minute: 0, weekdays: [], patternId: null, enabled: true });
    const early = await addReminder(db, { hour: 7, minute: 30, weekdays: [2, 3, 4, 5, 6], patternId: 'box', enabled: true });
    expect((await listReminders(db)).map((r) => r.id)).toEqual([early, late]);
    expect((await listReminders(db))[0]).toEqual({ id: early, hour: 7, minute: 30, weekdays: [2, 3, 4, 5, 6], patternId: 'box', enabled: true });

    expect(await updateReminder(db, { id: late!, hour: 22, minute: 15, weekdays: [1, 2, 3, 4, 5, 6, 7], patternId: null, enabled: false })).toBe(true);
    expect((await listReminders(db)).find((r) => r.id === late)).toMatchObject({ hour: 22, minute: 15, weekdays: [], enabled: false });

    await deleteReminder(db, early!);
    expect(await listReminders(db)).toHaveLength(1);
    expect(await updateReminder(db, { id: 999, hour: 1, minute: 1, weekdays: [], patternId: null, enabled: true })).toBe(false);
  });

  it('refuses a bad time and more than the limit', async () => {
    const db = await freshDb();
    expect(await addReminder(db, { hour: 25, minute: 0, weekdays: [], patternId: null, enabled: true })).toBeNull();
    for (let i = 0; i < MAX_REMINDERS; i++) expect(await addReminder(db, { hour: i, minute: 0, weekdays: [], patternId: null, enabled: true })).not.toBeNull();
    expect(await addReminder(db, { hour: 12, minute: 0, weekdays: [], patternId: null, enabled: true })).toBeNull();
  });

  it('survives a backup and restore (the reminders come back; the phone schedule is rebuilt from them)', async () => {
    const db = await freshDb();
    await addReminder(db, { hour: 6, minute: 45, weekdays: [1, 7], patternId: 'slow', enabled: true });
    const backup = await createBackup(db, Date.UTC(2026, 8, 30));
    const other = await freshDb();
    await restoreBackup(other, backup);
    expect(await listReminders(other)).toMatchObject([{ hour: 6, minute: 45, weekdays: [1, 7], patternId: 'slow', enabled: true }]);
  });
});

describe('Health toggle setting', () => {
  it('is off by default and remembers when it was turned on', async () => {
    const db = await freshDb();
    expect(await getAppSettings(db)).toMatchObject({ healthSync: false, healthSyncSince: 0 });
    expect(DEFAULT_APP_SETTINGS.healthSync).toBe(false);
    await setHealthSync(db, true, 12345);
    expect(await getAppSettings(db)).toMatchObject({ healthSync: true, healthSyncSince: 12345 });
    await setHealthSync(db, false, 99999);
    expect(await getAppSettings(db)).toMatchObject({ healthSync: false, healthSyncSince: 12345 });
  });

  it('is never exported or restored: a backup must not switch Health on for a phone that never asked', async () => {
    expect(TRANSIENT_SETTING_KEYS).toEqual(expect.arrayContaining(['healthSync', 'healthSyncSince']));
    const db = await freshDb();
    await setHealthSync(db, true, 5);
    await setSetting(db, 'accent', 'teal');
    const backup = await createBackup(db, 0);
    expect(backup.data.settings).toEqual({ accent: 'teal' });
    const other = await freshDb();
    await restoreBackup(other, { ...backup, data: { ...backup.data, settings: { ...backup.data.settings, healthSync: '1' } } });
    expect((await getAppSettings(other)).healthSync).toBe(false);
  });
});

describe('writing sessions to Health', () => {
  it('finds only unsynced sessions that started after the toggle and are long enough to be saved', async () => {
    const db = await freshDb();
    const old = await addSession(db, 1000);
    const fresh = await addSession(db, 5000);
    const done = await addSession(db, 6000);
    await markHealthSynced(db, done);
    expect((await pendingHealthSessions(db, 0)).map((s) => s.id)).toEqual([old, fresh]);
    expect((await pendingHealthSessions(db, 2000)).map((s) => s.id)).toEqual([fresh]);
  });

  it('writes each session once with its real start and end, then marks it', async () => {
    const db = await freshDb();
    const id = await addSession(db, 10_000, 200);
    const calls: [number, number, string][] = [];
    const write = async (a: number, b: number, t: string) => {
      calls.push([a, b, t]);
      return true;
    };
    expect(await syncPendingToHealth(db, 0, write)).toBe(1);
    expect(calls).toEqual([[10_000, 10_000 + 200_000, healthTitle('Slow')]]);
    expect((await getSession(db, id))?.healthSynced).toBe(true);
    expect(await syncPendingToHealth(db, 0, write)).toBe(0);
    expect(calls).toHaveLength(1);
  });

  it('leaves a session unsynced when Health refuses, and tries again later', async () => {
    const db = await freshDb();
    const id = await addSession(db, 10_000);
    expect(await syncPendingToHealth(db, 0, async () => false)).toBe(0);
    expect((await getSession(db, id))?.healthSynced).toBe(false);
    expect(await syncPendingToHealth(db, 0, async () => true)).toBe(1);
    expect((await getSession(db, id))?.healthSynced).toBe(true);
  });

  it('never writes a session twice when two runs overlap', async () => {
    const db = await freshDb();
    await addSession(db, 10_000);
    let n = 0;
    const write = async () => {
      n++;
      await new Promise((r) => setTimeout(r, 5));
      return true;
    };
    await Promise.all([syncPendingToHealth(db, 0, write), syncPendingToHealth(db, 0, write)]);
    expect(n).toBe(1);
  });
});
