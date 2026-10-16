/**
 * v3 P7.4/P7.5 (iOS): pushes "minutes today" to the home-screen / Lock Screen widget and starts, updates and ends
 * the session Live Activity. The layouts (`src/widgets/breathe-widgets.tsx`) load lazily and only on iOS builds that
 * carry the widget extension (`WIDGETS=0` builds without it, see app.config.ts), so Android and such builds simply
 * skip this. Serialized; never throws: a widget problem must not touch a session.
 */
import { requireOptionalNativeModule } from 'expo';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { liveActivityPlan, startWidgetTimeline, type RunningSession } from './entry-points';

type Layouts = typeof import('@/widgets/breathe-widgets');

let layouts: Layouts | null | undefined;

function loadLayouts(): Layouts | null {
  if (layouts !== undefined) return layouts;
  // A module that throws while loading is a red screen in development, not a catchable error: check first.
  const built = Constants.expoConfig?.extra?.widgetsEnabled === true;
  if (Platform.OS !== 'ios' || !built || !requireOptionalNativeModule('ExpoWidgets')) return (layouts = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    layouts = require('@/widgets/breathe-widgets') as Layouts;
  } catch (e) {
    if (__DEV__) console.warn('[ios-surfaces] widgets unavailable', e);
    layouts = null;
  }
  return layouts;
}

/** Whether this build has the widget extension (Settings shows the Lock Screen option only then). */
export function iosSurfacesAvailable(): boolean {
  return loadLayouts() !== null;
}

let queue: Promise<void> = Promise.resolve();

function enqueue(work: () => Promise<void> | void): Promise<void> {
  queue = queue.then(work).catch((e) => {
    if (__DEV__) console.warn('[ios-surfaces]', e);
  });
  return queue;
}

/** Widget timeline: today's minutes now, 0 from midnight. */
export function publishStartWidget(minutes: number, url: string, now = Date.now()): Promise<void> {
  return enqueue(() => {
    const l = loadLayouts();
    if (!l) return;
    l.StartWidget.updateTimeline(startWidgetTimeline(minutes, url, now).map((e) => ({ date: new Date(e.date), props: e.props })));
  });
}

/** Starts, updates or ends the session Live Activity (one at a time). */
export function publishLiveActivity(enabled: boolean, session: RunningSession | null): Promise<void> {
  return enqueue(async () => {
    const l = loadLayouts();
    if (!l) return;
    const plan = liveActivityPlan(enabled, session);
    const running = l.SessionActivity.getInstances();
    if (plan.action === 'end') {
      await Promise.all(running.map((a) => a.end('immediate')));
      return;
    }
    const staleDate = plan.staleAt != null ? new Date(plan.staleAt) : undefined;
    const [current, ...extra] = running;
    await Promise.all(extra.map((a) => a.end('immediate')));
    if (current) await current.update(plan.props, staleDate);
    // ActivityKit starts one only while the app is in the foreground (sessions start there).
    else l.SessionActivity.start(plan.props, undefined, staleDate);
  });
}
