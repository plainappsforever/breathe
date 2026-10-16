import * as Notifications from 'expo-notifications';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRootNavigationState, useRouter } from 'expo-router';
import { SQLiteProvider, useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useEffect, useRef } from 'react';
import { AppState, useColorScheme } from 'react-native';

import { migrateLegacyCustomPattern } from '@/db/custom-patterns';
import { migrate } from '@/db/migrations';
import { getAllSettings, getThemePreference } from '@/db/settings';
import { parseAccent, setAccent } from '@/lib/accent';
import type { LaunchIntent } from '@/lib/launch-intent';
import { serializeTarget } from '@/lib/patterns';
import { addQuickActionListener, intentFromQuickAction, takeInitialQuickAction } from '@/lib/quick-actions';
import '@/lib/reminder-task'; // module scope on purpose: Android runs Snooze/Skip answers headless (V3 P6, D50)
import { configureNotifications, handleReminderResponse, syncReminders } from '@/lib/reminder-notifications';
import { applyThemePreference } from '@/lib/theme-preference';
import { publishTodayMinutes } from '@/lib/today-widgets';

configureNotifications();

async function initDatabase(db: SQLiteDatabase) {
  await migrate(db);
  await migrateLegacyCustomPattern(db);
  applyThemePreference(await getThemePreference(db));
  // Read before the first screen renders, so the chosen accent colour never flashes the default one.
  setAccent(parseAccent((await getAllSettings(db)).accent ?? null));
  // Reminders survive updates, restores and reboots because the phone's schedule is rebuilt from the database
  // on every start. Not awaited: it must never slow the first screen. It asks for no permission.
  syncReminders(db).catch(() => {});
}

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="app.db" onInit={initDatabase}>
      <Navigator />
    </SQLiteProvider>
  );
}

type Router = ReturnType<typeof useRouter>;

/** Every entry point from outside the app lands on the launch-intent route (D37), which starts the session once. */
function navigateToStart(router: Router, intent: LaunchIntent) {
  const { patternId, target } = intent;
  router.navigate({
    pathname: '/start',
    params: { ...(patternId ? { pattern: patternId } : {}), ...(target ? { target: serializeTarget(target) } : {}) },
  });
}

/** Launcher quick actions (v3 P7.1): the action that cold-started the app, and later ones while it runs. */
function useQuickActionStarts() {
  const router = useRouter();
  const navState = useRootNavigationState();
  const ready = !!navState?.key;

  useEffect(() => {
    if (!ready) return;
    const start = (intent: LaunchIntent | null) => {
      if (intent) navigateToStart(router, intent);
    };
    start(intentFromQuickAction(takeInitialQuickAction()));
    const sub = addQuickActionListener((action) => start(intentFromQuickAction(action)));
    return () => sub.remove();
  }, [ready, router]);
}

/** A tap on a reminder (or its Start button) starts a session through the launch-intent route (D37); Snooze and Skip are answered in place. */
function useReminderAnswers() {
  const router = useRouter();
  const navState = useRootNavigationState();
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!response || !navState?.key) return;
    const key = `${response.notification.request.identifier}|${response.notification.date}|${response.actionIdentifier}`;
    if (handled.current === key) return;
    handled.current = key;
    handleReminderResponse(response)
      .then((answer) => {
        if (answer.kind === 'start') navigateToStart(router, answer.intent);
        Notifications.clearLastNotificationResponse();
      })
      .catch(() => {});
  }, [response, navState?.key, router]);
}

/** The widgets' "minutes today" also follows deletes and restores: it is pushed whenever the app leaves the screen. */
function useWidgetRefreshOnLeave() {
  const db = useSQLiteContext();
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') publishTodayMinutes(db);
    });
    return () => sub.remove();
  }, [db]);
}

function Navigator() {
  const scheme = useColorScheme();
  useReminderAnswers();
  useQuickActionStarts();
  useWidgetRefreshOnLeave();
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false, title: 'Home' }} />
        <Stack.Screen name="start" options={{ headerShown: false, animation: 'none' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="patterns" options={{ title: 'Patterns', presentation: 'modal' }} />
        <Stack.Screen name="pattern" options={{ title: 'Pattern', presentation: 'modal' }} />
        <Stack.Screen name="custom" options={{ title: 'Custom pattern', presentation: 'modal' }} />
        <Stack.Screen name="history" options={{ title: 'History' }} />
        <Stack.Screen name="session" options={{ title: 'Session' }} />
        <Stack.Screen name="data" options={{ title: 'Export and backup' }} />
        <Stack.Screen name="reminders" options={{ title: 'Reminders' }} />
        <Stack.Screen name="about" options={{ title: 'About' }} />
        <Stack.Screen name="privacy" options={{ title: 'Privacy policy' }} />
      </Stack>
    </ThemeProvider>
  );
}
