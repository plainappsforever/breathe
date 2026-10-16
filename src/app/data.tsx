import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { BackButton } from '@/components/back-button';
import { LockGate } from '@/components/lock-gate';
import { ThemedText } from '@/components/themed-text';
import { ColumnStyle, Spacing } from '@/constants/theme';
import { syncReminders } from '@/lib/reminder-notifications';
import { createBackup, readExportSessions, restoreBackup } from '@/db/backup';
import { countSessionsBetween, deleteAllSessions, deleteSessionsBetween } from '@/db/sessions';
import { getAllSettings, getThemePreference } from '@/db/settings';
import { useTheme } from '@/hooks/use-theme';
import { parseAccent, setAccent } from '@/lib/accent';
import { pickTextFile, shareTextFile, type ShareResult } from '@/lib/data-io';
import { rangeFromText } from '@/lib/date-range';
import { backupFileName, backupToJson, parseBackup, sessionsToCsv, sessionsToJson, type ParsedBackup } from '@/lib/export';
import { applyThemePreference } from '@/lib/theme-preference';

export default function DataScreen() {
  return (
    <>
      <Stack.Screen options={{ headerLeft: () => <BackButton /> }} />
      <LockGate>
        <DataContent />
      </LockGate>
    </>
  );
}

type Pending = Extract<ParsedBackup, { ok: true }>;

function shareMessage(what: string, result: ShareResult): string {
  return result.shared ? `${what} ready to share.` : `Sharing is not available here. ${what} saved in the app as ${result.savedAs}.`;
}

function DataContent() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const scroll = useRef<ScrollView>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rangeCount, setRangeCount] = useState<number | null>(null);
  const [confirmRange, setConfirmRange] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);

  async function run(action: () => Promise<string>) {
    if (busy) return;
    setBusy(true);
    try {
      const message = await action();
      setStatus(message);
      // The message sits at the top; bring it into view from wherever the button was.
      if (message !== '') scroll.current?.scrollTo({ y: 0, animated: true });
    } catch (error) {
      setStatus(`That did not work: ${error instanceof Error ? error.message : 'unknown error'}`);
      scroll.current?.scrollTo({ y: 0, animated: true });
    } finally {
      setBusy(false);
    }
  }

  const exportSessions = (kind: 'csv' | 'json') =>
    run(async () => {
      const sessions = await readExportSessions(db);
      if (sessions.length === 0) return 'There are no sessions to export yet.';
      const now = Date.now();
      const text = kind === 'csv' ? sessionsToCsv(sessions) : sessionsToJson(sessions, now);
      const result = await shareTextFile(backupFileName(now, kind, 'breathe-sessions'), text, kind);
      return shareMessage(`${sessions.length} ${sessions.length === 1 ? 'session' : 'sessions'} as ${kind.toUpperCase()}:`, result);
    });

  const backUp = () =>
    run(async () => {
      const now = Date.now();
      const backup = await createBackup(db, now);
      const result = await shareTextFile(backupFileName(now), backupToJson(backup), 'json');
      return shareMessage('Backup of everything:', result);
    });

  const chooseBackup = () =>
    run(async () => {
      setPending(null);
      const text = await pickTextFile();
      if (text === null) return 'No file chosen.';
      const parsed = parseBackup(text);
      if (!parsed.ok) return parsed.error;
      setPending(parsed);
      return '';
    });

  const confirmRestore = () =>
    run(async () => {
      if (!pending) return '';
      await restoreBackup(db, pending.backup);
      // The look of the app follows the restored settings straight away.
      applyThemePreference(await getThemePreference(db));
      setAccent(parseAccent((await getAllSettings(db)).accent ?? null));
      await syncReminders(db).catch(() => 0); // restored reminders reach this phone's schedule (only if notifications are allowed here)
      const { sessions, customPatterns } = pending.counts;
      setPending(null);
      return `Restored ${sessions} ${sessions === 1 ? 'session' : 'sessions'} and ${customPatterns} custom ${customPatterns === 1 ? 'pattern' : 'patterns'}.`;
    });

  const checkRange = () =>
    run(async () => {
      setConfirmRange(false);
      const range = rangeFromText(from, to);
      if (!range.ok) {
        setRangeCount(null);
        return range.error;
      }
      const count = await countSessionsBetween(db, range.from, range.toExclusive);
      setRangeCount(count);
      return count === 0 ? 'No sessions in that range.' : '';
    });

  const deleteRange = () =>
    run(async () => {
      const range = rangeFromText(from, to);
      if (!range.ok) return range.error;
      if (!confirmRange) {
        setConfirmRange(true);
        return '';
      }
      const removed = await deleteSessionsBetween(db, range.from, range.toExclusive);
      setConfirmRange(false);
      setRangeCount(null);
      return `Deleted ${removed} ${removed === 1 ? 'session' : 'sessions'}.`;
    });

  const deleteAll = () =>
    run(async () => {
      if (!confirmAll) {
        setConfirmAll(true);
        return '';
      }
      const removed = await deleteAllSessions(db);
      setConfirmAll(false);
      return `Deleted ${removed} ${removed === 1 ? 'session' : 'sessions'}. Your settings and patterns are untouched.`;
    });

  const input = [styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }];

  return (
    <ScrollView
      ref={scroll}
      testID="data-screen"
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[styles.content, ColumnStyle]}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled">
      <ThemedText themeColor="textSecondary">
        Everything stays on this phone. These files go wherever you send them, so keep them somewhere private.
      </ThemedText>
      {status !== '' && (
        <ThemedText testID="data-status" accessibilityLiveRegion="polite">
          {status}
        </ThemedText>
      )}

      <ThemedText type="smallBold" style={styles.section}>
        Export sessions
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        A list of your sessions with notes, tags and mood answers, for a spreadsheet or your own records.
      </ThemedText>
      <View style={styles.pair}>
        <Button testID="export-csv" style={styles.flex} label="CSV" variant="secondary" onPress={() => exportSessions('csv')} />
        <Button testID="export-json" style={styles.flex} label="JSON" variant="secondary" onPress={() => exportSessions('json')} />
      </View>

      <ThemedText type="smallBold" style={styles.section}>
        Back up and restore
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        One file with your settings, custom patterns, sessions and reminders. Restoring replaces what is on this phone now.
      </ThemedText>
      <Button testID="backup" label="Back up everything" variant="secondary" onPress={backUp} />
      <Button testID="restore" label="Restore from a backup file" variant="secondary" onPress={chooseBackup} />
      {pending && (
        <View testID="restore-confirm-box" style={[styles.box, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText>
            Found {pending.counts.sessions} {pending.counts.sessions === 1 ? 'session' : 'sessions'}, {pending.counts.customPatterns} custom{' '}
            {pending.counts.customPatterns === 1 ? 'pattern' : 'patterns'}
            {pending.backup.exportedAt ? `, saved ${new Date(pending.backup.exportedAt).toLocaleDateString()}` : ''}. Restoring replaces
            everything on this phone.
          </ThemedText>
          <Button testID="restore-confirm" label="Replace with this backup" onPress={confirmRestore} />
          <Button testID="restore-cancel" label="Cancel" variant="secondary" onPress={() => setPending(null)} />
        </View>
      )}

      <ThemedText type="smallBold" style={styles.section}>
        Delete
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Delete a date range (both days included). To delete one session, open it from History.
      </ThemedText>
      <View style={styles.pair}>
        <TextInput
          testID="range-from"
          value={from}
          onChangeText={(t) => {
            setFrom(t);
            setRangeCount(null);
            setConfirmRange(false);
          }}
          placeholder="From 2026-09-01"
          placeholderTextColor={theme.textSecondary}
          accessibilityLabel="First day"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          keyboardType="numbers-and-punctuation"
          returnKeyType="done"
          style={[input, styles.flex]}
        />
        <TextInput
          testID="range-to"
          value={to}
          onChangeText={(t) => {
            setTo(t);
            setRangeCount(null);
            setConfirmRange(false);
          }}
          placeholder="To 2026-09-30"
          placeholderTextColor={theme.textSecondary}
          accessibilityLabel="Last day"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          keyboardType="numbers-and-punctuation"
          returnKeyType="done"
          style={[input, styles.flex]}
        />
      </View>
      <Button testID="range-check" label="Count sessions in range" variant="secondary" onPress={checkRange} />
      {rangeCount !== null && rangeCount > 0 && (
        <Button
          testID="range-delete"
          label={confirmRange ? `Tap again: delete ${rangeCount} ${rangeCount === 1 ? 'session' : 'sessions'}` : `Delete ${rangeCount} ${rangeCount === 1 ? 'session' : 'sessions'}`}
          variant="secondary"
          onPress={deleteRange}
        />
      )}
      <Button
        testID="delete-all"
        label={confirmAll ? 'Tap again to delete all sessions' : 'Delete all sessions'}
        variant="secondary"
        onPress={deleteAll}
      />
      <ThemedText type="small" themeColor="textSecondary">
        Deleting sessions keeps your settings and patterns.
      </ThemedText>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  section: {
    marginTop: Spacing.four,
  },
  pair: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
  input: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  box: {
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.two,
  },
});
