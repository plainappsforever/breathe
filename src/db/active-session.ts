import type { Phase } from '@/lib/patterns';

import { getSetting, setSetting } from './settings';
import type { Db } from './types';

/**
 * The session currently in progress, persisted so a crash or OS kill does not lose it. Stored as one
 * JSON value under a settings key; written on start, pause and resume, cleared on end.
 */
export type ActiveSession = {
  patternId: string;
  patternName: string;
  phases: Phase[];
  /** Serialized SessionTarget ("m:3", "b:20", "open"). */
  target: string;
  /** Wall-clock time the session first started (what History records). */
  startedAt: number;
  /** Engine clock origin: wall-clock now minus elapsed session time, shifted forward by every pause. Ignored while paused. */
  startTime: number;
  /** Elapsed session ms at the moment of pause; null while running. */
  pausedElapsedMs: number | null;
  /** Wall-clock time the pause began; null while running. */
  pausedAt: number | null;
  /**
   * v3.1: session ms the app has confirmed it guided (written on start, resume, phase starts at most every 5 s,
   * and when the app leaves the screen). Recovery saves only this much (REVIEW_V3 #3). Missing in older records.
   */
  guidedMs?: number | null;
  /** Wall-clock time of that confirmation. */
  guidedAt?: number | null;
};

const KEY = 'activeSession';

export async function saveActiveSession(db: Db, session: ActiveSession): Promise<void> {
  await setSetting(db, KEY, JSON.stringify(session));
}

export async function getActiveSession(db: Db): Promise<ActiveSession | null> {
  const raw = await getSetting(db, KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ActiveSession;
    if (typeof parsed.startTime !== 'number' || !Array.isArray(parsed.phases) || typeof parsed.target !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Deletes the record; true only if this call removed one (so two concurrent loads save a recovered session once). */
export async function clearActiveSession(db: Db): Promise<boolean> {
  const result = await db.runAsync('DELETE FROM settings WHERE key = ?', KEY);
  return result.changes > 0;
}
