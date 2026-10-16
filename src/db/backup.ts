import { buildBackup, TRANSIENT_SETTING_KEYS, type BackupData, type BackupFile, type ExportSession } from '@/lib/export';
import type { Phase } from '@/lib/patterns';

import { LATEST_VERSION } from './migrations';
import type { Db } from './types';

type SessionRow = {
  started_at: number;
  pattern_name: string;
  pattern_id: string | null;
  target: string | null;
  phases: string;
  planned_seconds: number | null;
  actual_seconds: number;
  breaths: number;
  completed: number;
  note: string;
  tags: string;
  mood_before: number | null;
  mood_after: number | null;
  health_synced: number;
  interrupted: number;
};

/** Sessions oldest first, in the shape the exports use. */
export async function readExportSessions(db: Db): Promise<ExportSession[]> {
  const rows = await db.getAllAsync<SessionRow>(
    'SELECT started_at, pattern_name, pattern_id, target, phases, planned_seconds, actual_seconds, breaths, completed, note, tags, mood_before, mood_after, health_synced, interrupted FROM sessions ORDER BY started_at ASC, id ASC'
  );
  return rows.map((r) => ({
    startedAt: r.started_at,
    patternName: r.pattern_name,
    patternId: r.pattern_id,
    target: r.target,
    phases: JSON.parse(r.phases) as Phase[],
    plannedSeconds: r.planned_seconds,
    actualSeconds: r.actual_seconds,
    breaths: r.breaths,
    completed: r.completed === 1,
    note: r.note,
    tags: r.tags,
    moodBefore: r.mood_before,
    moodAfter: r.mood_after,
    healthSynced: r.health_synced === 1,
    interrupted: r.interrupted === 1,
  }));
}

/** Everything a backup holds: settings, custom patterns, per-pattern prefs, sessions and reminders. */
export async function readBackupData(db: Db): Promise<BackupData> {
  const settingsRows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings ORDER BY key ASC');
  const custom = await db.getAllAsync<{ id: string; name: string; phases: string; created_at: number; updated_at: number }>(
    'SELECT id, name, phases, created_at, updated_at FROM custom_patterns ORDER BY created_at ASC, id ASC'
  );
  const prefs = await db.getAllAsync<{
    pattern_id: string;
    target: string | null;
    haptics: string | null;
    sound: number | null;
    fade: number | null;
    guidance: string | null;
    favorite: number;
    last_used_at: number | null;
  }>('SELECT pattern_id, target, haptics, sound, fade, guidance, favorite, last_used_at FROM pattern_prefs ORDER BY pattern_id ASC');
  const reminders = await db.getAllAsync<{ hour: number; minute: number; weekdays: string; pattern_id: string | null; enabled: number }>(
    'SELECT hour, minute, weekdays, pattern_id, enabled FROM reminders ORDER BY id ASC'
  );
  return {
    settings: Object.fromEntries(settingsRows.map((r) => [r.key, r.value])),
    customPatterns: custom.map((c) => ({ id: c.id, name: c.name, phases: JSON.parse(c.phases) as Phase[], createdAt: c.created_at, updatedAt: c.updated_at })),
    patternPrefs: prefs.map((p) => ({
      patternId: p.pattern_id,
      target: p.target,
      haptics: p.haptics,
      sound: p.sound,
      fade: p.fade,
      guidance: p.guidance,
      favorite: p.favorite,
      lastUsedAt: p.last_used_at,
    })),
    sessions: await readExportSessions(db),
    reminders: reminders.map((r) => ({ hour: r.hour, minute: r.minute, weekdays: r.weekdays, patternId: r.pattern_id, enabled: r.enabled })),
  };
}

export async function createBackup(db: Db, now = Date.now()): Promise<BackupFile> {
  return buildBackup(await readBackupData(db), LATEST_VERSION, now);
}

/**
 * Replaces everything on this device with the backup's contents, in one transaction: if anything fails the
 * database is left as it was. A session that is running right now (crash-recovery record) is dropped.
 */
export async function restoreBackup(db: Db, backup: BackupFile): Promise<void> {
  const { data } = backup;
  await db.execAsync('BEGIN');
  try {
    await db.execAsync('DELETE FROM sessions; DELETE FROM custom_patterns; DELETE FROM pattern_prefs; DELETE FROM reminders; DELETE FROM settings;');
    for (const [key, value] of Object.entries(data.settings)) {
      if (TRANSIENT_SETTING_KEYS.includes(key)) continue;
      await db.runAsync('INSERT INTO settings (key, value) VALUES (?, ?)', key, value);
    }
    for (const c of data.customPatterns) {
      await db.runAsync(
        'INSERT INTO custom_patterns (id, name, phases, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        c.id,
        c.name,
        JSON.stringify(c.phases),
        c.createdAt,
        c.updatedAt
      );
    }
    for (const p of data.patternPrefs) {
      await db.runAsync(
        'INSERT INTO pattern_prefs (pattern_id, target, haptics, sound, fade, guidance, favorite, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        p.patternId,
        p.target,
        p.haptics,
        p.sound,
        p.fade,
        p.guidance,
        p.favorite,
        p.lastUsedAt
      );
    }
    for (const s of data.sessions) {
      await db.runAsync(
        'INSERT INTO sessions (started_at, pattern_name, phases, planned_seconds, actual_seconds, breaths, completed, pattern_id, target, note, tags, mood_before, mood_after, health_synced, interrupted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        s.startedAt,
        s.patternName,
        JSON.stringify(s.phases),
        s.plannedSeconds,
        s.actualSeconds,
        s.breaths,
        s.completed ? 1 : 0,
        s.patternId,
        s.target,
        s.note,
        s.tags,
        s.moodBefore,
        s.moodAfter,
        s.healthSynced ? 1 : 0,
        s.interrupted ? 1 : 0
      );
    }
    for (const r of data.reminders) {
      await db.runAsync('INSERT INTO reminders (hour, minute, weekdays, pattern_id, enabled) VALUES (?, ?, ?, ?, ?)', r.hour, r.minute, r.weekdays, r.patternId, r.enabled);
    }
    await db.execAsync('COMMIT');
  } catch (error) {
    await db.execAsync('ROLLBACK').catch(() => {});
    throw error;
  }
}
