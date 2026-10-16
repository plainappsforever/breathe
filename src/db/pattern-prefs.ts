import { parseTarget, serializeTarget, type SessionTarget } from '@/lib/patterns';

import type { Db } from './types';

/** Per-pattern overrides (presets and custom patterns alike). null = use the global setting. */
export type PatternPrefs = {
  patternId: string;
  target: SessionTarget | null;
  haptics: string | null;
  sound: boolean | null;
  fade: boolean | null;
  guidance: string | null;
  favorite: boolean;
  lastUsedAt: number | null;
};

type Row = {
  pattern_id: string;
  target: string | null;
  haptics: string | null;
  sound: number | null;
  fade: number | null;
  guidance: string | null;
  favorite: number;
  last_used_at: number | null;
};

const COLUMNS = 'pattern_id, target, haptics, sound, fade, guidance, favorite, last_used_at';

function fromRow(row: Row): PatternPrefs {
  return {
    patternId: row.pattern_id,
    target: parseTarget(row.target),
    haptics: row.haptics,
    sound: row.sound === null ? null : row.sound === 1,
    fade: row.fade === null ? null : row.fade === 1,
    guidance: row.guidance,
    favorite: row.favorite === 1,
    lastUsedAt: row.last_used_at,
  };
}

export async function getPatternPrefs(db: Db, patternId: string): Promise<PatternPrefs | null> {
  const row = await db.getFirstAsync<Row>(`SELECT ${COLUMNS} FROM pattern_prefs WHERE pattern_id = ?`, patternId);
  return row ? fromRow(row) : null;
}

async function ensureRow(db: Db, patternId: string): Promise<void> {
  await db.runAsync('INSERT OR IGNORE INTO pattern_prefs (pattern_id) VALUES (?)', patternId);
}

/** The pattern's own default target; null clears it so the pattern follows the global choice again. */
export async function setPatternTarget(db: Db, patternId: string, target: SessionTarget | null): Promise<void> {
  await ensureRow(db, patternId);
  await db.runAsync('UPDATE pattern_prefs SET target = ? WHERE pattern_id = ?', target ? serializeTarget(target) : null, patternId);
}

export async function setPatternFavorite(db: Db, patternId: string, favorite: boolean): Promise<void> {
  await ensureRow(db, patternId);
  await db.runAsync('UPDATE pattern_prefs SET favorite = ? WHERE pattern_id = ?', favorite ? 1 : 0, patternId);
}

/** Marks a pattern as just used (drives "Recent"). Called when a session starts. */
export async function touchPatternUsed(db: Db, patternId: string, now = Date.now()): Promise<void> {
  await ensureRow(db, patternId);
  await db.runAsync('UPDATE pattern_prefs SET last_used_at = ? WHERE pattern_id = ?', now, patternId);
}

/** Most recently used pattern ids, newest first (max 3 by default). */
export async function listRecentPatternIds(db: Db, limit = 3): Promise<string[]> {
  const rows = await db.getAllAsync<{ pattern_id: string }>(
    'SELECT pattern_id FROM pattern_prefs WHERE last_used_at IS NOT NULL ORDER BY last_used_at DESC, pattern_id ASC LIMIT ?',
    limit
  );
  return rows.map((r) => r.pattern_id);
}

/**
 * A pattern's own guidance overrides (V3 P3). null clears the override so the pattern follows the global
 * setting again. haptics is 'off' | 'on'; sound and fade are booleans.
 */
export async function setPatternOverride(
  db: Db,
  patternId: string,
  field: 'haptics' | 'sound' | 'fade',
  value: 'off' | 'on' | boolean | null
): Promise<void> {
  await ensureRow(db, patternId);
  const stored = value === null ? null : typeof value === 'boolean' ? (value ? 1 : 0) : value;
  // field is one of three fixed column names, never user text.
  await db.runAsync(`UPDATE pattern_prefs SET ${field} = ? WHERE pattern_id = ?`, stored, patternId);
}

/** Ids of favourite patterns (presets and custom alike). */
export async function listFavoritePatternIds(db: Db): Promise<string[]> {
  const rows = await db.getAllAsync<{ pattern_id: string }>('SELECT pattern_id FROM pattern_prefs WHERE favorite = 1 ORDER BY pattern_id ASC');
  return rows.map((r) => r.pattern_id);
}
