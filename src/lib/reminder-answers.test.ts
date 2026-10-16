// v3.1 F6 (REVIEW_V3 #17): a Snooze answered by the Android headless task and delivered again when the app opens
// in the same process is acted on once.
import * as Notifications from 'expo-notifications';

import { handleReminderResponse } from './reminder-notifications';
import { SNOOZE_ACTION } from './reminders';

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('id')),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
  dismissNotificationAsync: jest.fn(() => Promise.resolve()),
  SchedulableTriggerInputTypes: { DATE: 'date', TIME_INTERVAL: 'timeInterval', DAILY: 'daily', WEEKLY: 'weekly' },
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
}));
jest.mock('./session-runner', () => ({ sessionRunnerModule: null }));
jest.mock('@/db/reminders', () => ({ listReminders: jest.fn() }));
jest.mock('@/db/custom-patterns', () => ({ resolvePatternById: jest.fn() }));

function snoozeResponse(date: number) {
  return {
    actionIdentifier: SNOOZE_ACTION,
    notification: {
      date,
      request: {
        identifier: 'reminder-3-2026-10-01',
        content: { title: 'Breathe', body: 'Time to breathe', data: { reminderId: 3, patternId: null, url: 'breathe://start' } },
        trigger: null,
      },
    },
  } as unknown as Notifications.NotificationResponse;
}

describe('handleReminderResponse', () => {
  it('acts on the same Snooze answer once, and on a new one again', async () => {
    await handleReminderResponse(snoozeResponse(1000));
    await handleReminderResponse(snoozeResponse(1000));
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    await handleReminderResponse(snoozeResponse(2000));
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
  });
});
