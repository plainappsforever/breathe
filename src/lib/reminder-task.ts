import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { handleReminderResponse } from './reminder-notifications';

/**
 * Android only (V3_PLAN "expo-notifications actions"): Snooze and Skip do not open the app, so when the app is
 * in the background or closed the answer arrives here, in a headless JS run. Must be imported at module scope
 * of the root layout so the task exists in that run. iOS delivers these answers to the response listener when
 * the app is running or suspended.
 */
export const REMINDER_TASK = 'BREATHE-REMINDER-ACTIONS';

if (Platform.OS === 'android') {
  TaskManager.defineTask<Notifications.NotificationTaskPayload>(REMINDER_TASK, async ({ data }) => {
    if (data && typeof data === 'object' && 'actionIdentifier' in data) {
      await handleReminderResponse(data as Notifications.NotificationResponse).catch(() => {});
    }
  });
  Notifications.registerTaskAsync(REMINDER_TASK).catch(() => {});
}
