import type { Db } from '@/db/types';
import { MIN_SAVED_SESSION_SECONDS } from './patterns';

/**
 * Which saved sessions still have to be written to Health, and the loop that writes them (V3 P6, D51).
 * `sessions.health_synced` marks the written ones, so a session is never written twice. Only sessions that
 * started after the Health toggle was turned on are written (turning it on does not copy old history).
 */
export type PendingHealthSession = { id: number; startedAt: number; actualSeconds: number; patternName: string };

export async function pendingHealthSessions(db: Db, sinceMs: number): Promise<PendingHealthSession[]> {
  const rows = await db.getAllAsync<{ id: number; started_at: number; actual_seconds: number; pattern_name: string }>(
    'SELECT id, started_at, actual_seconds, pattern_name FROM sessions WHERE health_synced = 0 AND started_at >= ? AND actual_seconds >= ? ORDER BY started_at ASC',
    sinceMs,
    MIN_SAVED_SESSION_SECONDS
  );
  return rows.map((r) => ({ id: r.id, startedAt: r.started_at, actualSeconds: r.actual_seconds, patternName: r.pattern_name }));
}

export async function markHealthSynced(db: Db, id: number): Promise<void> {
  await db.runAsync('UPDATE sessions SET health_synced = 1 WHERE id = ?', id);
}

export type HealthWriter = (startMs: number, endMs: number, title: string) => Promise<boolean>;

export const healthTitle = (patternName: string): string => `Breathe Well: ${patternName}`;

// One run at a time: the end of a session and the app start can both ask, and a session must not be written twice.
let queue: Promise<unknown> = Promise.resolve();

/** Writes every pending session with `write`; returns how many were written. Stops at the first refusal. */
export function syncPendingToHealth(db: Db, sinceMs: number, write: HealthWriter): Promise<number> {
  const run = queue.then(async () => {
    let written = 0;
    for (const session of await pendingHealthSessions(db, sinceMs)) {
      const ok = await write(session.startedAt, session.startedAt + session.actualSeconds * 1000, healthTitle(session.patternName));
      if (!ok) break;
      await markHealthSynced(db, session.id);
      written++;
    }
    return written;
  });
  queue = run.catch(() => {});
  return run;
}
