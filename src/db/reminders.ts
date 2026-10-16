import { isValidTime, MAX_REMINDERS, parseWeekdays, serializeWeekdays, type Reminder } from '@/lib/reminders';

import type { Db } from './types';

type ReminderRow = { id: number; hour: number; minute: number; weekdays: string; pattern_id: string | null; enabled: number };

function fromRow(row: ReminderRow): Reminder {
  return {
    id: row.id,
    hour: row.hour,
    minute: row.minute,
    weekdays: parseWeekdays(row.weekdays),
    patternId: row.pattern_id,
    enabled: row.enabled === 1,
  };
}

export async function listReminders(db: Db): Promise<Reminder[]> {
  const rows = await db.getAllAsync<ReminderRow>(
    'SELECT id, hour, minute, weekdays, pattern_id, enabled FROM reminders ORDER BY hour ASC, minute ASC, id ASC'
  );
  return rows.map(fromRow);
}

export type ReminderInput = Omit<Reminder, 'id'>;

/** Adds a reminder; returns its id, or null when the limit is reached or the time is invalid. */
export async function addReminder(db: Db, input: ReminderInput): Promise<number | null> {
  if (!isValidTime(input.hour, input.minute)) return null;
  const count = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM reminders');
  if ((count?.n ?? 0) >= MAX_REMINDERS) return null;
  const result = await db.runAsync(
    'INSERT INTO reminders (hour, minute, weekdays, pattern_id, enabled) VALUES (?, ?, ?, ?, ?)',
    input.hour,
    input.minute,
    serializeWeekdays(input.weekdays),
    input.patternId,
    input.enabled ? 1 : 0
  );
  return result.lastInsertRowId;
}

/** Saves every field of a reminder. Returns false when it is gone or the time is invalid. */
export async function updateReminder(db: Db, reminder: Reminder): Promise<boolean> {
  if (!isValidTime(reminder.hour, reminder.minute)) return false;
  const result = await db.runAsync(
    'UPDATE reminders SET hour = ?, minute = ?, weekdays = ?, pattern_id = ?, enabled = ? WHERE id = ?',
    reminder.hour,
    reminder.minute,
    serializeWeekdays(reminder.weekdays),
    reminder.patternId,
    reminder.enabled ? 1 : 0,
    reminder.id
  );
  return result.changes > 0;
}

export async function deleteReminder(db: Db, id: number): Promise<void> {
  await db.runAsync('DELETE FROM reminders WHERE id = ?', id);
}
