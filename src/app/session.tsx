import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { BackButton } from '@/components/back-button';
import { LockGate } from '@/components/lock-gate';
import { ThemedText } from '@/components/themed-text';
import { ColumnStyle, Spacing } from '@/constants/theme';
import { patternExists } from '@/db/custom-patterns';
import { deleteSession, getSession, listAllSessions, updateSessionNote, type SessionRecord } from '@/db/sessions';
import { useTheme } from '@/hooks/use-theme';
import { formatSessionSummary } from '@/lib/format';
import { normalizeNote, MAX_NOTE_LENGTH, parseTags, serializeTags, tagChoices } from '@/lib/history-filter';
import { setPendingIntent } from '@/lib/launch-intent';
import { PRESETS, targetLabel } from '@/lib/patterns';
import { repeatIntent } from '@/lib/repeat-session';

export default function SessionDetailScreen() {
  return (
    <>
      <Stack.Screen options={{ headerLeft: () => <BackButton /> }} />
      <LockGate>
        <SessionDetail />
      </LockGate>
    </>
  );
}

function SessionDetail() {
  const db = useSQLiteContext();
  const router = useRouter();
  const theme = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = Number(params.id);
  const [session, setSession] = useState<SessionRecord | null | undefined>(undefined);
  const [note, setNote] = useState('');
  const [tagText, setTagText] = useState('');
  const [known, setKnown] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [canRepeat, setCanRepeat] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const row = Number.isInteger(id) ? await getSession(db, id) : null;
      if (!active) return;
      setSession(row);
      if (!row) return;
      setNote(row.note);
      setTagText(parseTags(row.tags).join(', '));
      const [all, exists] = await Promise.all([listAllSessions(db), row.patternId ? patternExists(db, row.patternId) : Promise.resolve(false)]);
      if (!active) return;
      setKnown(tagChoices(all).map((t) => t.tag));
      setCanRepeat(repeatIntent(row, exists, presetIdFor(row.patternName)) !== null);
    })().catch(() => active && setSession(null));
    return () => {
      active = false;
    };
  }, [db, id]);

  if (session === undefined) return null;
  if (session === null) {
    return (
      <View style={[styles.gone, { backgroundColor: theme.background }]}>
        <ThemedText themeColor="textSecondary">This session is no longer in your history.</ThemedText>
        <Button label="Back" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }

  const tags = parseTags(tagText);

  async function save() {
    const record = session;
    if (!record) return;
    const cleanNote = normalizeNote(note);
    const cleanTags = serializeTags(tags);
    if (cleanNote === record.note && cleanTags === record.tags) return;
    await updateSessionNote(db, record.id, cleanNote, cleanTags);
    setSession({ ...record, note: cleanNote, tags: cleanTags });
    setSaved(true);
  }

  function addTag(tag: string) {
    setSaved(false);
    setTagText(serializeTags(parseTags(`${tagText},${tag}`)).split(',').join(', '));
  }

  async function repeat() {
    const record = session;
    if (!record) return;
    const exists = record.patternId ? await patternExists(db, record.patternId) : false;
    const intent = repeatIntent(record, exists, presetIdFor(record.patternName));
    if (!intent) return;
    await save();
    setPendingIntent(intent);
    router.dismissTo('/');
  }

  async function remove() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (session) await deleteSession(db, session.id);
    router.back();
  }

  const started = new Date(session.startedAt);
  const suggestions = known.filter((t) => !tags.includes(t)).slice(0, 8);

  return (
    <ScrollView
      testID="session-screen"
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[styles.content, ColumnStyle]}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag">
      <ThemedText type="title">{session.patternName}</ThemedText>
      <ThemedText testID="session-summary">{formatSessionSummary(session.actualSeconds, session.breaths)}</ThemedText>
      <ThemedText themeColor="textSecondary">{started.toLocaleString()}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {session.target ? `Chosen length: ${targetLabel(session.target)}. ` : ''}
        {session.completed
          ? 'Finished.'
          : session.interrupted
            ? 'Interrupted: the app was closed during this session. Only the time it guided you is saved.'
            : 'Ended early.'}
      </ThemedText>
      {(session.moodBefore !== null || session.moodAfter !== null) && (
        <ThemedText testID="mood-line">
          Mood {session.moodBefore ?? '–'} → {session.moodAfter ?? '–'}
        </ThemedText>
      )}

      <ThemedText type="smallBold" style={styles.section}>
        Note
      </ThemedText>
      <TextInput
        testID="note-input"
        value={note}
        onChangeText={(text) => {
          setNote(text.slice(0, MAX_NOTE_LENGTH));
          setSaved(false);
        }}
        onBlur={save}
        placeholder="How was it? (only stored on this phone)"
        placeholderTextColor={theme.textSecondary}
        accessibilityLabel="Note"
        multiline
        style={[styles.note, { backgroundColor: theme.backgroundElement, color: theme.text }]}
      />
      <ThemedText testID="tags-label" type="smallBold">
        Tags
      </ThemedText>
      <TextInput
        testID="tags-input"
        value={tagText}
        onChangeText={(text) => {
          setTagText(text);
          setSaved(false);
        }}
        onBlur={save}
        placeholder="Separate with commas, e.g. before bed, work"
        placeholderTextColor={theme.textSecondary}
        accessibilityLabel="Tags"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
        style={[styles.field, { backgroundColor: theme.backgroundElement, color: theme.text }]}
      />
      {suggestions.length > 0 && (
        <View style={styles.chips}>
          {suggestions.map((tag) => (
            <Pressable
              key={tag}
              testID={`suggest-tag-${tag}`}
              accessibilityRole="button"
              onPress={() => addTag(tag)}
              style={[styles.chip, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="small">+ {tag}</ThemedText>
            </Pressable>
          ))}
        </View>
      )}
      <Button testID="save-note" label={saved ? 'Saved' : 'Save note and tags'} variant="secondary" onPress={save} />

      <View style={styles.actions}>
        {canRepeat ? (
          <Button testID="repeat-session" label="Repeat this session" onPress={repeat} />
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            This pattern was deleted, so the session cannot be repeated.
          </ThemedText>
        )}
        <Button
          testID="delete-session"
          label={confirmDelete ? 'Tap again to delete this session' : 'Delete this session'}
          variant="secondary"
          onPress={remove}
        />
      </View>
    </ScrollView>
  );
}

function presetIdFor(name: string): string | null {
  return PRESETS.find((p) => p.name === name)?.id ?? null;
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  gone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  section: {
    marginTop: Spacing.three,
  },
  note: {
    minHeight: 96,
    borderRadius: 12,
    padding: Spacing.three,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  field: {
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    minHeight: 36,
    borderRadius: 18,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    marginTop: Spacing.four,
    gap: Spacing.two,
  },
});
