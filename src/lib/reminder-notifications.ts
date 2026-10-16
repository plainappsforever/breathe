import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { listReminders } from '@/db/reminders';
import type { Db } from '@/db/types';
import { resolvePatternById } from '@/db/custom-patterns';

import { appScheme } from './app-scheme';
import {
  answerFor,
  buildPayload,
  contentData,
  isReminderRequestId,
  REMINDER_TITLE,
  reminderBody,
  SKIP_ACTION,
  SNOOZE_ACTION,
  SNOOZE_ID_PREFIX,
  SNOOZE_MINUTES,
  snoozeRequestId,
  START_ACTION,
  triggerPlan,
  type ReminderAnswer,
  type ReminderPayload,
} from './reminders';
import { sessionRunnerModule } from './session-runner';

/**
 * expo-notifications glue for reminders (V3 P6, D50). The pure rules live in `reminders.ts`.
 * The permission is asked only by `requestPermission`, which the Reminders screen calls when the first
 * reminder is added; nothing here runs a prompt on its own.
 */
export const REMINDER_CHANNEL = 'reminders';
export const REMINDER_CATEGORY = 'reminder';
export type PermissionState = 'granted' | 'denied' | 'undetermined';

let sessionRunning = false;
/** While a session runs, a reminder that arrives stays out of the way (no banner, no sound) — L10. */
export function setSessionRunning(running: boolean): void {
  sessionRunning = running;
}

/** Call once at startup (module scope of the root layout). Sets how notifications show while the app is open. */
export function configureNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: !sessionRunning,
      shouldShowList: !sessionRunning,
      shouldPlaySound: !sessionRunning,
      shouldSetBadge: false,
    }),
  });
}

/** The action buttons (Start opens the app; Snooze and Skip do not) and, on Android, the channel. */
export async function prepareChannelAndCategory(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL, {
      name: 'Reminders',
      description: 'Your breathing reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
      enableVibrate: true,
    });
  }
  await Notifications.setNotificationCategoryAsync(REMINDER_CATEGORY, [
    { identifier: START_ACTION, buttonTitle: 'Start', options: { opensAppToForeground: true } },
    { identifier: SNOOZE_ACTION, buttonTitle: `Snooze ${SNOOZE_MINUTES} min`, options: { opensAppToForeground: false } },
    { identifier: SKIP_ACTION, buttonTitle: 'Skip today', options: { opensAppToForeground: false } },
  ]);
}

export async function getPermission(): Promise<{ state: PermissionState; canAskAgain: boolean }> {
  const p = await Notifications.getPermissionsAsync();
  const state: PermissionState = p.granted ? 'granted' : p.status === Notifications.PermissionStatus.UNDETERMINED ? 'undetermined' : 'denied';
  return { state, canAskAgain: p.canAskAgain };
}

/** Shows the system prompt (Android 13+ needs the channel to exist first). Returns whether it was granted. */
export async function requestPermission(): Promise<boolean> {
  await prepareChannelAndCategory();
  const result = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
  return result.granted;
}

/** Android 12+ without "Alarms & reminders": reminders may be up to an hour late. Always true elsewhere. */
export function canRemindExactly(): boolean {
  try {
    return sessionRunnerModule?.canScheduleExactAlarms() ?? true;
  } catch {
    return true;
  }
}

export function openExactAlarmSettings(): boolean {
  try {
    return sessionRunnerModule?.openExactAlarmSettings() ?? false;
  } catch {
    return false;
  }
}

const scheme = appScheme;

// Two overlapping "cancel everything, then schedule" runs leave extra requests behind (seen in eye-app), so they queue.
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

function contentFor(payload: ReminderPayload, patternName: string | null): Notifications.NotificationContentInput {
  return {
    title: REMINDER_TITLE,
    body: reminderBody(patternName),
    categoryIdentifier: REMINDER_CATEGORY,
    data: payload,
    interruptionLevel: 'active',
  };
}

/**
 * Makes the phone's schedule match the stored reminders: cancels every reminder request of ours (snoozes
 * stay) and schedules the enabled ones. Runs on app start, when Reminders opens, and after every change.
 * Returns how many requests are pending. Without permission it only cancels.
 */
export function syncReminders(db: Db): Promise<number> {
  return serialized(async () => {
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    for (const request of pending) {
      if (isReminderRequestId(request.identifier)) await Notifications.cancelScheduledNotificationAsync(request.identifier);
    }
    const reminders = (await listReminders(db)).filter((r) => r.enabled);
    if (reminders.length === 0 || (await getPermission()).state !== 'granted') return 0;
    await prepareChannelAndCategory();
    let scheduled = 0;
    for (const reminder of reminders) {
      const patternName = reminder.patternId ? (await resolvePatternById(db, reminder.patternId)).name : null;
      const content = contentFor(buildPayload(scheme(), reminder), patternName);
      for (const spec of triggerPlan(reminder)) {
        await Notifications.scheduleNotificationAsync({
          identifier: spec.identifier,
          content,
          trigger:
            spec.weekday === undefined
              ? { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: spec.hour, minute: spec.minute, channelId: REMINDER_CHANNEL }
              : {
                  type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
                  weekday: spec.weekday,
                  hour: spec.hour,
                  minute: spec.minute,
                  channelId: REMINDER_CHANNEL,
                },
        });
        scheduled++;
      }
    }
    return scheduled;
  });
}

/** How many reminder requests and snoozes are pending; shown in development builds only (Maestro reads it). */
export async function pendingCounts(): Promise<{ reminders: number; snoozes: number }> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  return {
    reminders: all.filter((n) => isReminderRequestId(n.identifier)).length,
    snoozes: all.filter((n) => n.identifier.startsWith(SNOOZE_ID_PREFIX)).length,
  };
}

/** The "Send a test reminder" button: a real reminder-shaped notification a few seconds from now. */
export async function sendTestReminder(seconds = 5): Promise<void> {
  await prepareChannelAndCategory();
  await Notifications.scheduleNotificationAsync({
    identifier: 'test-reminder',
    content: contentFor({ reminderId: 0, patternId: null, url: `${scheme()}://start` }, null),
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, channelId: REMINDER_CHANNEL },
  });
}

async function snooze(payload: ReminderPayload, body: string | null): Promise<void> {
  const id = snoozeRequestId(payload.reminderId);
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: {
      title: REMINDER_TITLE,
      body: body ?? reminderBody(null),
      categoryIdentifier: REMINDER_CATEGORY,
      data: payload,
      interruptionLevel: 'active',
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: SNOOZE_MINUTES * 60, channelId: REMINDER_CHANNEL },
  });
}

/**
 * Acts on an answer to a reminder. Snooze and Skip are complete here and touch no database (on Android they
 * can run headless, with the app closed); "Start" is only reported: the root layout starts the session through
 * the launch-intent route. Running it twice for one answer is harmless (the snooze request id is fixed).
 * "Skip today": the day's reminder has already fired, so skipping stops any snooze and clears the notification;
 * tomorrow's reminder is untouched.
 */
// Snooze / Skip answers already acted on in this JS run. On Android the headless task may answer one with the app
// closed; when the app then opens in the same process, the last-response hook delivers it again (REVIEW_V3 #17).
const answeredInPlace = new Set<string>();

export async function handleReminderResponse(response: Notifications.NotificationResponse): Promise<ReminderAnswer> {
  const { identifier, content } = response.notification.request;
  const answer = answerFor(response.actionIdentifier, contentData(content as { data?: unknown; dataString?: unknown }));
  if (answer.kind === 'snooze' || answer.kind === 'skip') {
    const key = `${identifier}|${response.notification.date}|${response.actionIdentifier}`;
    if (answeredInPlace.has(key)) return answer;
    answeredInPlace.add(key);
  }
  if (answer.kind === 'snooze') {
    await snooze(answer.payload, content.body);
    await Notifications.dismissNotificationAsync(identifier).catch(() => {});
  } else if (answer.kind === 'skip') {
    await Notifications.cancelScheduledNotificationAsync(snoozeRequestId(answer.payload.reminderId)).catch(() => {});
    await Notifications.dismissNotificationAsync(identifier).catch(() => {});
  }
  return answer;
}
