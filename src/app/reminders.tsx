import { Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { BackButton } from '@/components/back-button';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ColumnStyle, Spacing } from '@/constants/theme';
import { listCustomPatterns, toPattern } from '@/db/custom-patterns';
import { addReminder, deleteReminder, listReminders, updateReminder } from '@/db/reminders';
import { useTheme } from '@/hooks/use-theme';
import { PRESETS, type Pattern } from '@/lib/patterns';
import {
  canRemindExactly,
  getPermission,
  openExactAlarmSettings,
  pendingCounts,
  requestPermission,
  sendTestReminder,
  syncReminders,
  type PermissionState,
} from '@/lib/reminder-notifications';
import {
  DEFAULT_REMINDER_TIME,
  describeWeekdays,
  formatTime,
  INEXACT_WARNING,
  MAX_REMINDERS,
  pad2,
  SNOOZE_MINUTES,
  stepTime,
  toggleWeekday,
  WEEKDAY_ORDER,
  WEEKDAY_SHORT,
  type Reminder,
} from '@/lib/reminders';

async function countText(): Promise<string> {
  const { reminders, snoozes } = await pendingCounts();
  return `scheduled: ${reminders} snoozed: ${snoozes}`;
}

const WEEKDAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Reminders (V3 P6, D50). Nothing exists until the user adds one; the notification permission is asked at
 * that moment and never before. Settings > Reminders opens this screen.
 */
export default function RemindersScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [reminders, setReminders] = useState<Reminder[] | null>(null);
  const [patterns, setPatterns] = useState<Pattern[]>([...PRESETS]);
  const [editing, setEditing] = useState<number | null>(null);
  const [permission, setPermission] = useState<{ state: PermissionState; canAskAgain: boolean }>({ state: 'undetermined', canAskAgain: true });
  const [exact, setExact] = useState(true);
  const [note, setNote] = useState('');
  const [scheduled, setScheduled] = useState<string | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    const [list, custom, perm] = await Promise.all([listReminders(db), listCustomPatterns(db), getPermission()]);
    setReminders(list);
    setPatterns([...PRESETS, ...custom.map(toPattern)]);
    setPermission(perm);
    setExact(canRemindExactly());
    if (__DEV__) setScheduled(await countText());
  }, [db]);

  const syncNow = useCallback(async () => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = null;
    await syncReminders(db).catch(() => 0);
    if (__DEV__) setScheduled(await countText().catch(() => null));
  }, [db]);

  /** Changes reach the phone's schedule shortly after the last tap (steppers can be tapped quickly). */
  const scheduleSync = useCallback(() => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      syncNow().catch(() => {});
    }, 500);
  }, [syncNow]);

  useFocusEffect(
    useCallback(() => {
      // Coming back from the phone's settings (permission, "Alarms & reminders") re-reads both and rebuilds the schedule.
      refresh()
        .then(() => syncNow())
        .catch(() => {});
      return () => {
        if (syncTimer.current) {
          clearTimeout(syncTimer.current);
          syncTimer.current = null;
          syncReminders(db).catch(() => {});
        }
      };
    }, [db, refresh, syncNow])
  );

  useEffect(
    () => () => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
    },
    []
  );

  async function add() {
    setNote('');
    // The first reminder is the moment the permission is asked (never earlier, never on launch).
    let perm = await getPermission();
    if (perm.state !== 'granted' && (perm.state === 'undetermined' || perm.canAskAgain)) {
      await requestPermission();
      perm = await getPermission();
    }
    const id = await addReminder(db, { ...DEFAULT_REMINDER_TIME, weekdays: [], patternId: null, enabled: true });
    if (id === null) {
      setNote(`You can have up to ${MAX_REMINDERS} reminders.`);
      return;
    }
    setPermission(perm);
    setEditing(id);
    await refresh();
    await syncNow();
  }

  async function save(next: Reminder) {
    setReminders((list) => (list ? list.map((r) => (r.id === next.id ? next : r)) : list));
    await updateReminder(db, next);
    scheduleSync();
  }

  async function remove(id: number) {
    await deleteReminder(db, id);
    setEditing(null);
    await refresh();
    await syncNow();
  }

  async function allowNotifications() {
    if (permission.state === 'undetermined' || permission.canAskAgain) {
      await requestPermission();
      await refresh();
      await syncNow();
    } else {
      await Linking.openSettings().catch(() => {});
    }
  }

  async function test() {
    setNote('');
    await sendTestReminder(5);
    setNote('A test reminder will arrive in about 5 seconds.');
  }

  if (!reminders) return null;
  const anyEnabled = reminders.some((r) => r.enabled);

  return (
    <>
      <Stack.Screen options={{ headerLeft: () => <BackButton label="Settings" /> }} />
      <ScrollView
        testID="reminders-screen"
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={[styles.content, ColumnStyle]}
        contentInsetAdjustmentBehavior="automatic">
        <ThemedText type="small" themeColor="textSecondary">
          A quiet nudge at the times you choose. Nothing is set up until you add a reminder. Tap the notification, or Start, to begin a
          session; Snooze waits {SNOOZE_MINUTES} minutes; Skip today stops any snooze for today.
        </ThemedText>

        {__DEV__ && scheduled !== null && (
          <ThemedText testID="scheduled-count" type="small" themeColor="textSecondary">
            {scheduled}
          </ThemedText>
        )}

        {anyEnabled && permission.state !== 'granted' && (
          <View testID="perm-banner" style={[styles.banner, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="small">
              {permission.state === 'undetermined' || permission.canAskAgain
                ? 'Reminders cannot arrive until notifications are allowed.'
                : 'Notifications are turned off for Breathe Well in your phone settings, so reminders cannot arrive.'}
            </ThemedText>
            <Button
              testID="perm-allow"
              variant="secondary"
              label={permission.state === 'undetermined' || permission.canAskAgain ? 'Allow notifications' : 'Open phone settings'}
              onPress={allowNotifications}
            />
          </View>
        )}

        {anyEnabled && permission.state === 'granted' && !exact && (
          <View testID="exact-banner" style={[styles.banner, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="small">{INEXACT_WARNING}</ThemedText>
            <Button
              testID="exact-allow"
              variant="secondary"
              label="Allow exact timing"
              onPress={() => {
                if (!openExactAlarmSettings()) setNote('This phone has no page for exact timing; reminders may be a little late.');
              }}
            />
          </View>
        )}

        {reminders.length === 0 && (
          <ThemedText testID="reminders-empty" themeColor="textSecondary">
            No reminders.
          </ThemedText>
        )}

        {reminders.map((reminder) => {
          const open = editing === reminder.id;
          const patternName = reminder.patternId ? (patterns.find((p) => p.id === reminder.patternId)?.name ?? 'Default pattern') : 'Default pattern';
          return (
            <View key={reminder.id} style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
              <View style={styles.cardHead}>
                <Pressable
                  testID={`reminder-${reminder.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${formatTime(reminder.hour, reminder.minute)}, ${describeWeekdays(reminder.weekdays)}, ${patternName}`}
                  onPress={() => setEditing(open ? null : reminder.id)}
                  style={styles.cardTitle}>
                  <ThemedText type="subtitle">{formatTime(reminder.hour, reminder.minute)}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {describeWeekdays(reminder.weekdays)} · {patternName}
                  </ThemedText>
                </Pressable>
                <Switch
                  testID={`reminder-enabled-${reminder.id}`}
                  value={reminder.enabled}
                  onValueChange={(v) => save({ ...reminder, enabled: v })}
                  trackColor={{ true: theme.tint }}
                />
              </View>

              {open && (
                <View style={styles.editor}>
                  <ThemedText type="smallBold">Time</ThemedText>
                  <View style={styles.stepRow}>
                    <Step
                      testID="hour-minus"
                      label="Hour earlier"
                      text="−"
                      onPress={() => save({ ...reminder, ...stepTime(reminder.hour, reminder.minute, -60) })}
                    />
                    <ThemedText testID="hour-value" type="subtitle" style={styles.stepValue}>
                      {pad2(reminder.hour)}
                    </ThemedText>
                    <Step
                      testID="hour-plus"
                      label="Hour later"
                      text="+"
                      onPress={() => save({ ...reminder, ...stepTime(reminder.hour, reminder.minute, 60) })}
                    />
                    <ThemedText type="subtitle">:</ThemedText>
                    <Step
                      testID="minute-minus5"
                      label="Five minutes earlier"
                      text="−5"
                      onPress={() => save({ ...reminder, ...stepTime(reminder.hour, reminder.minute, -5) })}
                    />
                    <Step
                      testID="minute-minus1"
                      label="One minute earlier"
                      text="−1"
                      onPress={() => save({ ...reminder, ...stepTime(reminder.hour, reminder.minute, -1) })}
                    />
                    <ThemedText testID="minute-value" type="subtitle" style={styles.stepValue}>
                      {pad2(reminder.minute)}
                    </ThemedText>
                    <Step
                      testID="minute-plus1"
                      label="One minute later"
                      text="+1"
                      onPress={() => save({ ...reminder, ...stepTime(reminder.hour, reminder.minute, 1) })}
                    />
                    <Step
                      testID="minute-plus5"
                      label="Five minutes later"
                      text="+5"
                      onPress={() => save({ ...reminder, ...stepTime(reminder.hour, reminder.minute, 5) })}
                    />
                  </View>

                  <ThemedText type="smallBold">Days</ThemedText>
                  <View style={styles.chips}>
                    {WEEKDAY_ORDER.map((day) => {
                      const selected = reminder.weekdays.length === 0 || reminder.weekdays.includes(day);
                      return (
                        <Pressable
                          key={day}
                          testID={`weekday-${day}`}
                          accessibilityRole="button"
                          accessibilityLabel={WEEKDAY_SHORT[day - 1]}
                          accessibilityState={{ selected }}
                          onPress={() => save({ ...reminder, weekdays: toggleWeekday(reminder.weekdays, day) })}
                          style={[styles.dayChip, { backgroundColor: selected ? theme.backgroundSelected : theme.background }]}>
                          <ThemedText type={selected ? 'smallBold' : 'small'} themeColor={selected ? 'text' : 'textSecondary'}>
                            {WEEKDAY_LETTER[day - 1]}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>

                  <ThemedText type="smallBold">Pattern</ThemedText>
                  <View style={styles.chips}>
                    <PatternChip
                      testID="pattern-default"
                      label="Default"
                      selected={reminder.patternId === null}
                      onPress={() => save({ ...reminder, patternId: null })}
                    />
                    {patterns.map((p) => (
                      <PatternChip
                        key={p.id}
                        testID={`pattern-${p.id}`}
                        label={p.name}
                        selected={reminder.patternId === p.id}
                        onPress={() => save({ ...reminder, patternId: p.id })}
                      />
                    ))}
                  </View>
                  <ThemedText type="small" themeColor="textSecondary">
                    Default means the pattern and length you used last.
                  </ThemedText>

                  <Button testID="reminder-delete" variant="secondary" label="Delete this reminder" onPress={() => remove(reminder.id)} />
                </View>
              )}
            </View>
          );
        })}

        <Button
          testID="add-reminder"
          label="Add a reminder"
          disabled={reminders.length >= MAX_REMINDERS}
          onPress={() => add().catch(() => setNote('Could not add the reminder.'))}
        />
        {reminders.length >= MAX_REMINDERS && (
          <ThemedText type="small" themeColor="textSecondary">
            That is the most reminders ({MAX_REMINDERS}).
          </ThemedText>
        )}

        {reminders.length > 0 && permission.state === 'granted' && (
          <Button testID="test-reminder" variant="secondary" label="Send a test reminder" onPress={() => test().catch(() => {})} />
        )}
        {note !== '' && (
          <ThemedText testID="reminders-note" type="small" themeColor="textSecondary">
            {note}
          </ThemedText>
        )}
      </ScrollView>
    </>
  );
}

function Step({ testID, label, text, onPress }: { testID: string; label: string; text: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={[styles.step, { backgroundColor: theme.background }]}>
      <ThemedText type="smallBold">{text}</ThemedText>
    </Pressable>
  );
}

function PatternChip({ testID, label, selected, onPress }: { testID: string; label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.patternChip, { backgroundColor: selected ? theme.backgroundSelected : theme.background }]}>
      <ThemedText type={selected ? 'smallBold' : 'small'} themeColor={selected ? 'text' : 'textSecondary'}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three },
  banner: { borderRadius: 12, padding: Spacing.three, gap: Spacing.two },
  card: { borderRadius: 12, padding: Spacing.three, gap: Spacing.three },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  cardTitle: { flex: 1, minHeight: 48, justifyContent: 'center' },
  editor: { gap: Spacing.two },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, flexWrap: 'wrap' },
  step: { minWidth: 44, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.two },
  stepValue: { minWidth: 40, textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  dayChip: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  patternChip: { minHeight: 40, borderRadius: 20, paddingHorizontal: Spacing.three, justifyContent: 'center' },
});
