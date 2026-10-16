/**
 * v3 P7.3/P7.4: pushes "minutes today" to the home-screen widgets (Android: modules/start-widget; iOS: the
 * expo-widgets timeline in `ios-surfaces.ts`). Called when Home loads, after a session is saved and when the app goes
 * to the background (covers deletes and restores). Serialized; never throws: a widget problem must not touch a session.
 */
import { Platform } from 'react-native';

import { sumSessionsBetween } from '@/db/sessions';
import type { Db } from '@/db/types';

import StartWidget from '../../modules/start-widget/src/StartWidgetModule';
import { appScheme } from './app-scheme';
import { todayMinutes } from './entry-points';
import { publishStartWidget } from './ios-surfaces';
import { buildLaunchUrl } from './launch-intent';
import { addDays, startOfDay } from './stats';

let queue: Promise<void> = Promise.resolve();

export function publishTodayMinutes(db: Db, now = Date.now()): Promise<void> {
  queue = queue.then(() => publish(db, now)).catch((e) => {
    if (__DEV__) console.warn('[widgets]', e);
  });
  return queue;
}

async function publish(db: Db, now: number): Promise<void> {
  const dayStart = startOfDay(now);
  const { seconds, count } = await sumSessionsBetween(db, dayStart, addDays(dayStart, 1));
  const minutes = todayMinutes(seconds, count);
  if (Platform.OS === 'android') StartWidget?.setTodayMinutes(dayStart, minutes);
  else await publishStartWidget(minutes, buildLaunchUrl(appScheme(), {}), now);
}
