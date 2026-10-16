import { MIN_SAVED_SESSION_SECONDS, parseTarget, serializeTarget, type Phase, type SessionTarget } from '@/lib/patterns';

import type { Db } from './types';

export type SessionRecord = {
  id: number;
  startedAt: number;
  patternName: string;
  phases: Phase[];
  plannedSeconds: number | null;
  actualSeconds: number;
  breaths: number;
  completed: boolean;
  /** null for sessions recorded before v3. */
  patternId: string | null;
  target: SessionTarget | null;
  note: string;
  tags: string;
  moodBefore: number | null;
  moodAfter: number | null;
  healthSynced: boolean;
  /** Saved by the app after it was closed mid-session: only the time it guided (v3.1, migration 4). */
  interrupted: boolean;
};

type SessionRow = {
  id: number;
  started_at: number;
  pattern_name: string;
  phases: string;
  planned_seconds: number | null;
  actual_seconds: number;
  breaths: number;
  completed: number;
  pattern_id: string | null;
  target: string | null;
  note: string;
  tags: string;
  mood_before: number | null;
  mood_after: number | null;
  health_synced: number;
  interrupted: number;
};

const COLUMNS =
  'id, started_at, pattern_name, phases, planned_seconds, actual_seconds, breaths, completed, pattern_id, target, note, tags, mood_before, mood_after, health_synced, interrupted';

function fromRow(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    startedAt: row.started_at,
    patternName: row.pattern_name,
    phases: JSON.parse(row.phases),
    plannedSeconds: row.planned_seconds,
    actualSeconds: row.actual_seconds,
    breaths: row.breaths,
    completed: row.completed === 1,
    patternId: row.pattern_id,
    target: parseTarget(row.target),
    note: row.note,
    tags: row.tags,
    moodBefore: row.mood_before,
    moodAfter: row.mood_after,
    healthSynced: row.health_synced === 1,
    interrupted: row.interrupted === 1,
  };
}

export type SessionInput = {
  patternName: string;
  phases: readonly Phase[];
  plannedSeconds: number | null;
  actualSeconds: number;
  breaths: number;
  completed: boolean;
  patternId?: string | null;
  target?: SessionTarget | null;
  /** 1-5 from the optional check-in before the session (V3 P5); null when not asked or skipped. */
  moodBefore?: number | null;
  /** The app saved it after being closed mid-session (crash recovery): the guided part only, never completed. */
  interrupted?: boolean;
};

/** Sessions shorter than MIN_SAVED_SESSION_SECONDS are not stored (SPEC "End view"). Returns the new row id, or null if not saved. */
export async function recordSession(db: Db, input: SessionInput, startedAt = Date.now()): Promise<number | null> {
  if (input.actualSeconds < MIN_SAVED_SESSION_SECONDS) return null;
  const result = await db.runAsync(
    'INSERT INTO sessions (started_at, pattern_name, phases, planned_seconds, actual_seconds, breaths, completed, pattern_id, target, mood_before, interrupted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    startedAt,
    input.patternName,
    JSON.stringify(input.phases),
    input.plannedSeconds,
    input.actualSeconds,
    input.breaths,
    input.completed ? 1 : 0,
    input.patternId ?? null,
    input.target ? serializeTarget(input.target) : null,
    input.moodBefore ?? null,
    input.interrupted ? 1 : 0
  );
  return result.lastInsertRowId;
}

export async function listRecentSessions(db: Db, limit = 50): Promise<SessionRecord[]> {
  const rows = await db.getAllAsync<SessionRow>(
    `SELECT ${COLUMNS} FROM sessions ORDER BY started_at DESC, id DESC LIMIT ?`,
    limit
  );
  return rows.map(fromRow);
}

export async function getSession(db: Db, id: number): Promise<SessionRecord | null> {
  const row = await db.getFirstAsync<SessionRow>(`SELECT ${COLUMNS} FROM sessions WHERE id = ?`, id);
  return row ? fromRow(row) : null;
}

/** Every session, newest first. History filters and totals are computed in memory (a local list, at most a few thousand rows). */
export async function listAllSessions(db: Db): Promise<SessionRecord[]> {
  const rows = await db.getAllAsync<SessionRow>(`SELECT ${COLUMNS} FROM sessions ORDER BY started_at DESC, id DESC`);
  return rows.map(fromRow);
}

/** Saves the note and the tags (already normalized by `history-filter.ts`). Returns false if the session is gone. */
export async function updateSessionNote(db: Db, id: number, note: string, tags: string): Promise<boolean> {
  const result = await db.runAsync('UPDATE sessions SET note = ?, tags = ? WHERE id = ?', note, tags, id);
  return result.changes > 0;
}

export type MoodMoment = 'before' | 'after';

/** A 1-5 answer to the optional mood check-in, or null to clear it. Anything else is ignored. */
export async function setSessionMood(db: Db, id: number, moment: MoodMoment, value: number | null): Promise<void> {
  if (value !== null && !(Number.isInteger(value) && value >= 1 && value <= 5)) return;
  const column = moment === 'before' ? 'mood_before' : 'mood_after'; // fixed names, never user text
  await db.runAsync(`UPDATE sessions SET ${column} = ? WHERE id = ?`, value, id);
}

export async function deleteSession(db: Db, id: number): Promise<void> {
  await db.runAsync('DELETE FROM sessions WHERE id = ?', id);
}

/** Deletes sessions that started in [fromMs, toMs). Returns how many were removed. */
export async function deleteSessionsBetween(db: Db, fromMs: number, toMs: number): Promise<number> {
  const result = await db.runAsync('DELETE FROM sessions WHERE started_at >= ? AND started_at < ?', fromMs, toMs);
  return result.changes;
}

export async function deleteAllSessions(db: Db): Promise<number> {
  const result = await db.runAsync('DELETE FROM sessions');
  return result.changes;
}

export async function countSessionsBetween(db: Db, fromMs: number, toMs: number): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM sessions WHERE started_at >= ? AND started_at < ?', fromMs, toMs);
  return row?.count ?? 0;
}

/** Total saved seconds and session count for sessions that started in [fromMs, toMs) (the widgets' "minutes today"). */
export async function sumSessionsBetween(db: Db, fromMs: number, toMs: number): Promise<{ seconds: number; count: number }> {
  const row = await db.getFirstAsync<{ seconds: number | null; count: number }>(
    'SELECT SUM(actual_seconds) AS seconds, COUNT(*) AS count FROM sessions WHERE started_at >= ? AND started_at < ?',
    fromMs,
    toMs
  );
  return { seconds: row?.seconds ?? 0, count: row?.count ?? 0 };
}
