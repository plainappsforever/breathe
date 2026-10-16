import { findPreset, normalizePatternName, patternFromPhases, validateCustomPattern, CUSTOM_ID_PREFIX, type CustomInput, type Pattern, type Phase } from '@/lib/patterns';

import { getSetting, setSetting } from './settings';
import type { Db } from './types';

export type CustomPatternRecord = {
  id: string;
  name: string;
  phases: Phase[];
  createdAt: number;
  updatedAt: number;
};

type Row = { id: string; name: string; phases: string; created_at: number; updated_at: number };

const COLUMNS = 'id, name, phases, created_at, updated_at';

function fromRow(row: Row): CustomPatternRecord {
  return { id: row.id, name: row.name, phases: JSON.parse(row.phases), createdAt: row.created_at, updatedAt: row.updated_at };
}

export function newCustomPatternId(now = Date.now()): string {
  return `${CUSTOM_ID_PREFIX}${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function toPattern(record: CustomPatternRecord): Pattern {
  return patternFromPhases(record.id, record.name, record.phases);
}

export async function listCustomPatterns(db: Db): Promise<CustomPatternRecord[]> {
  const rows = await db.getAllAsync<Row>(`SELECT ${COLUMNS} FROM custom_patterns ORDER BY created_at ASC, id ASC`);
  return rows.map(fromRow);
}

export async function getCustomPattern(db: Db, id: string): Promise<CustomPatternRecord | null> {
  const row = await db.getFirstAsync<Row>(`SELECT ${COLUMNS} FROM custom_patterns WHERE id = ?`, id);
  return row ? fromRow(row) : null;
}

/** Creates a custom pattern from the five stepper values. Throws with the validation message if they are invalid. */
export async function createCustomPattern(
  db: Db,
  input: { name: string; values: CustomInput },
  now = Date.now()
): Promise<CustomPatternRecord> {
  const validation = validateCustomPattern(input.values);
  if (!validation.ok) throw new Error(validation.error);
  const record: CustomPatternRecord = {
    id: newCustomPatternId(now),
    name: normalizePatternName(input.name),
    phases: validation.phases,
    createdAt: now,
    updatedAt: now,
  };
  await db.runAsync(
    'INSERT INTO custom_patterns (id, name, phases, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    record.id,
    record.name,
    JSON.stringify(record.phases),
    record.createdAt,
    record.updatedAt
  );
  return record;
}

/** Updates the name and/or timing of a custom pattern. Returns false if it does not exist. */
export async function updateCustomPattern(
  db: Db,
  id: string,
  changes: { name?: string; values?: CustomInput },
  now = Date.now()
): Promise<boolean> {
  const existing = await getCustomPattern(db, id);
  if (!existing) return false;
  let phases = existing.phases;
  if (changes.values) {
    const validation = validateCustomPattern(changes.values);
    if (!validation.ok) throw new Error(validation.error);
    phases = validation.phases;
  }
  const name = changes.name === undefined ? existing.name : normalizePatternName(changes.name);
  await db.runAsync('UPDATE custom_patterns SET name = ?, phases = ?, updated_at = ? WHERE id = ?', name, JSON.stringify(phases), now, id);
  return true;
}

export async function renameCustomPattern(db: Db, id: string, name: string, now = Date.now()): Promise<boolean> {
  return updateCustomPattern(db, id, { name }, now);
}

/** Copies a custom pattern as "<name> copy". Returns the copy, or null if the original is gone. */
export async function duplicateCustomPattern(db: Db, id: string, now = Date.now()): Promise<CustomPatternRecord | null> {
  const original = await getCustomPattern(db, id);
  if (!original) return null;
  const copy: CustomPatternRecord = {
    id: newCustomPatternId(now),
    name: normalizePatternName(`${original.name} copy`),
    phases: original.phases,
    createdAt: now,
    updatedAt: now,
  };
  await db.runAsync(
    'INSERT INTO custom_patterns (id, name, phases, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    copy.id,
    copy.name,
    JSON.stringify(copy.phases),
    copy.createdAt,
    copy.updatedAt
  );
  return copy;
}

/** Deletes a pattern and its prefs. If it was the selected pattern, the selection falls back to Slow. Past sessions keep their own copy of the pattern. */
export async function deleteCustomPattern(db: Db, id: string): Promise<void> {
  await db.runAsync('DELETE FROM custom_patterns WHERE id = ?', id);
  await db.runAsync('DELETE FROM pattern_prefs WHERE pattern_id = ?', id);
  if ((await getSetting(db, 'patternId')) === id) await setSetting(db, 'patternId', 'slow');
}

/** A preset, a custom pattern, or (if the id is unknown, e.g. deleted) Slow. */
export async function resolvePatternById(db: Db, id: string): Promise<Pattern> {
  const preset = findPreset(id);
  if (preset) return preset;
  const custom = await getCustomPattern(db, id);
  return custom ? toPattern(custom) : findPreset('slow')!;
}

/** True if the id names a preset or an existing custom pattern. */
export async function patternExists(db: Db, id: string): Promise<boolean> {
  return findPreset(id) !== undefined || (await getCustomPattern(db, id)) !== null;
}

/**
 * v1 stored one custom pattern in the `customPattern` setting. On first run of v3 it becomes a row named
 * "Custom" (and stays selected if it was); the old key is removed so this runs once. Safe to call every launch.
 */
export async function migrateLegacyCustomPattern(db: Db, now = Date.now()): Promise<CustomPatternRecord | null> {
  const legacy = await getSetting(db, 'customPattern');
  if (legacy === null) return null;
  let record: CustomPatternRecord | null = null;
  try {
    record = await createCustomPattern(db, { name: 'Custom', values: JSON.parse(legacy) as CustomInput }, now);
  } catch {
    record = null; // unreadable legacy value: drop it rather than fail every launch
  }
  if (record && (await getSetting(db, 'patternId')) === 'custom') await setSetting(db, 'patternId', record.id);
  await db.runAsync("DELETE FROM settings WHERE key = 'customPattern'");
  if ((await getSetting(db, 'patternId')) === 'custom') await setSetting(db, 'patternId', 'slow');
  return record;
}
