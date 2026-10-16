import { buildLaunchUrl, intentFromParams, parseLaunchUrl, type LaunchIntent } from './launch-intent';

/**
 * Reminder model and the pure rules around it (V3 P6, D50). No expo imports, so all of it is unit-tested;
 * `reminder-notifications.ts` feeds these to expo-notifications.
 *
 * Weekdays follow expo-notifications: 1 = Sunday ... 7 = Saturday. An empty list means every day.
 */
export type Reminder = {
  id: number;
  hour: number;
  minute: number;
  /** Sorted, unique, 1-7; empty = every day. */
  weekdays: number[];
  /** Preset or custom pattern id; null = the user's default pattern at the time of the reminder. */
  patternId: string | null;
  enabled: boolean;
};

/** 8 reminders x 7 weekly triggers = 56, plus at most 8 snoozes = 64: the most iOS keeps pending per app. */
export const MAX_REMINDERS = 8;
export const SNOOZE_MINUTES = 10;

export const DEFAULT_REMINDER_TIME = { hour: 8, minute: 0 } as const;

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
/** Chips in the editor start on Monday. */
export const WEEKDAY_ORDER: readonly number[] = [2, 3, 4, 5, 6, 7, 1];

const WEEKDAYS_ONLY = [2, 3, 4, 5, 6];
const WEEKEND = [1, 7];

/** "" or all seven days = every day = []. Anything that is not 1-7 is dropped. */
export function normalizeWeekdays(days: readonly number[]): number[] {
  const set = new Set(days.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7));
  if (set.size === 7) return [];
  return [...set].sort((a, b) => a - b);
}

export function parseWeekdays(text: string | null | undefined): number[] {
  if (!text) return [];
  return normalizeWeekdays(text.split(',').map((part) => Number(part.trim())));
}

export function serializeWeekdays(days: readonly number[]): string {
  return normalizeWeekdays(days).join(',');
}

/** Toggles one weekday in the editor. Never leaves the list empty by mistake: removing the last day is ignored. */
export function toggleWeekday(current: readonly number[], day: number): number[] {
  const all = current.length === 0 ? [1, 2, 3, 4, 5, 6, 7] : [...current];
  const next = all.includes(day) ? all.filter((d) => d !== day) : [...all, day];
  if (next.length === 0) return normalizeWeekdays(all);
  return normalizeWeekdays(next);
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 24-hour clock, the same on every phone (the editor uses the same format). */
export function formatTime(hour: number, minute: number): string {
  return `${pad2(hour)}:${pad2(minute)}`;
}

export function describeWeekdays(days: readonly number[]): string {
  const list = normalizeWeekdays(days);
  if (list.length === 0) return 'Every day';
  if (list.join() === WEEKDAYS_ONLY.join()) return 'Weekdays';
  if (list.join() === WEEKEND.join()) return 'Weekends';
  return WEEKDAY_ORDER.filter((d) => list.includes(d))
    .map((d) => WEEKDAY_SHORT[d - 1])
    .join(', ');
}

/** Wraps around midnight; minutes move in the given step. */
export function stepTime(hour: number, minute: number, deltaMinutes: number): { hour: number; minute: number } {
  const total = (((hour * 60 + minute + deltaMinutes) % 1440) + 1440) % 1440;
  return { hour: Math.floor(total / 60), minute: total % 60 };
}

/** One entry of the schedule for a reminder: a DAILY trigger, or one WEEKLY trigger per selected day. */
export type TriggerSpec = { identifier: string; hour: number; minute: number; weekday?: number };

export const REMINDER_ID_PREFIX = 'reminder-';
export const SNOOZE_ID_PREFIX = 'snooze-';

export function triggerPlan(reminder: Pick<Reminder, 'id' | 'hour' | 'minute' | 'weekdays'>): TriggerSpec[] {
  const days = normalizeWeekdays(reminder.weekdays);
  if (days.length === 0) {
    return [{ identifier: `${REMINDER_ID_PREFIX}${reminder.id}-d`, hour: reminder.hour, minute: reminder.minute }];
  }
  return days.map((weekday) => ({
    identifier: `${REMINDER_ID_PREFIX}${reminder.id}-w${weekday}`,
    hour: reminder.hour,
    minute: reminder.minute,
    weekday,
  }));
}

export function isReminderRequestId(identifier: string): boolean {
  return identifier.startsWith(REMINDER_ID_PREFIX);
}

export function snoozeRequestId(reminderId: number): string {
  return `${SNOOZE_ID_PREFIX}${reminderId}`;
}

/** Everything a reminder notification carries, so an answer never needs the database (Android runs it headless). */
export type ReminderPayload = {
  reminderId: number;
  patternId: string | null;
  url: string;
};

export const REMINDER_TITLE = 'Time to breathe';

export function reminderBody(patternName: string | null): string {
  return patternName ? `${patternName}, whenever you are ready.` : 'A short pause, whenever you are ready.';
}

export function buildPayload(scheme: string, reminder: Pick<Reminder, 'id' | 'patternId'>): ReminderPayload {
  return {
    reminderId: reminder.id,
    patternId: reminder.patternId,
    url: buildLaunchUrl(scheme, reminder.patternId ? { patternId: reminder.patternId } : {}),
  };
}

/**
 * A notification's data as JS gets it. In a headless Android run (app closed) the content arrives with the data
 * only as a JSON string (`dataString`); in a normal run it is the `data` object.
 */
export function contentData(content: { data?: unknown; dataString?: unknown }): unknown {
  if (content.data && typeof content.data === 'object' && Object.keys(content.data).length > 0) return content.data;
  if (typeof content.dataString === 'string') {
    try {
      return JSON.parse(content.dataString);
    } catch {
      return null;
    }
  }
  return null;
}

/** Reads the payload back from a notification's data; anything unexpected gives null. */
export function readPayload(data: unknown): ReminderPayload | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (typeof d.reminderId !== 'number' || typeof d.url !== 'string') return null;
  return {
    reminderId: d.reminderId,
    patternId: typeof d.patternId === 'string' ? d.patternId : null,
    url: d.url,
  };
}

export type ReminderAnswer =
  | { kind: 'start'; intent: LaunchIntent }
  | { kind: 'snooze'; payload: ReminderPayload }
  | { kind: 'skip'; payload: ReminderPayload }
  | { kind: 'ignore' };

export const START_ACTION = 'start';
export const SNOOZE_ACTION = 'snooze';
export const SKIP_ACTION = 'skip';
/** expo-notifications' identifier for a tap on the notification itself. */
export const DEFAULT_TAP = 'expo.modules.notifications.actions.DEFAULT';

/**
 * What an answer to a reminder means. A tap on the notification and the "Start" button both start the
 * session through the launch-intent parser (D37); Snooze and Skip never open the app.
 */
export function answerFor(actionIdentifier: string, data: unknown): ReminderAnswer {
  const payload = readPayload(data);
  if (!payload) return { kind: 'ignore' };
  if (actionIdentifier === SNOOZE_ACTION) return { kind: 'snooze', payload };
  if (actionIdentifier === SKIP_ACTION) return { kind: 'skip', payload };
  if (actionIdentifier === START_ACTION || actionIdentifier === DEFAULT_TAP) {
    return { kind: 'start', intent: parseLaunchUrl(payload.url) ?? intentFromParams({}) };
  }
  return { kind: 'ignore' };
}

/** Validates a time typed or stepped by the user (hour 0-23, minute 0-59). */
export function isValidTime(hour: number, minute: number): boolean {
  return Number.isInteger(hour) && Number.isInteger(minute) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

/** Text under a reminder when its exact time cannot be guaranteed (Android 12+ without "Alarms & reminders"). */
export const INEXACT_WARNING = 'Reminders may arrive up to an hour late.';
