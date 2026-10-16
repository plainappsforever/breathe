import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ColumnStyle, Spacing } from '@/constants/theme';
import { getAppSettings, setPattern, setTarget, type AppSettings } from '@/db/app-settings';
import { listCustomPatterns, toPattern, type CustomPatternRecord } from '@/db/custom-patterns';
import {
  getPatternPrefs,
  listFavoritePatternIds,
  listRecentPatternIds,
  setPatternFavorite,
  setPatternTarget,
  type PatternPrefs,
} from '@/db/pattern-prefs';
import { useTheme } from '@/hooks/use-theme';
import { buildPatternSections } from '@/lib/pattern-list';
import {
  BREATH_OPTIONS,
  DIFFICULTY_LABELS,
  findPreset,
  MINUTE_OPTIONS,
  phaseLine,
  PRESETS,
  targetLabel,
  targetsEqual,
  type Pattern,
  type SessionTarget,
} from '@/lib/patterns';

export default function PatternsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const theme = useTheme();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [customPatterns, setCustomPatterns] = useState<CustomPatternRecord[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [prefs, setPrefs] = useState<PatternPrefs | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const loaded = await getAppSettings(db);
        const [custom, recent, selectedPrefs, favorites] = await Promise.all([
          listCustomPatterns(db),
          listRecentPatternIds(db),
          getPatternPrefs(db, loaded.patternId),
          listFavoritePatternIds(db),
        ]);
        if (!active) return;
        setSettings(loaded);
        setCustomPatterns(custom);
        setRecentIds(recent);
        setPrefs(selectedPrefs);
        setFavoriteIds(favorites);
      })().catch(() => {});
      return () => {
        active = false;
      };
    }, [db])
  );

  function nameOf(id: string): string | null {
    return findPreset(id)?.name ?? customPatterns.find((c) => c.id === id)?.name ?? null;
  }

  async function choosePattern(id: string) {
    await setPattern(db, id);
    // A pattern with its own remembered length brings it along.
    const patternPrefs = await getPatternPrefs(db, id);
    if (patternPrefs?.target) await setTarget(db, patternPrefs.target);
    router.back();
  }

  async function chooseTarget(target: SessionTarget) {
    setSettings((s) => (s ? { ...s, target } : s));
    await setTarget(db, target);
  }

  async function toggleFavorite(id: string) {
    const next = !favoriteIds.includes(id);
    setFavoriteIds((ids) => (next ? [...ids, id] : ids.filter((x) => x !== id)));
    await setPatternFavorite(db, id, next);
  }

  async function toggleRemember() {
    if (!settings) return;
    const remembered = prefs?.target && targetsEqual(prefs.target, settings.target);
    const next = remembered ? null : settings.target;
    await setPatternTarget(db, settings.patternId, next);
    setPrefs(await getPatternPrefs(db, settings.patternId));
  }

  if (!settings) return null;

  const selectedName = nameOf(settings.patternId) ?? 'this pattern';
  const remembered = prefs?.target != null && targetsEqual(prefs.target, settings.target);
  const recent = recentIds.filter((id) => nameOf(id) !== null);

  function targetChip(target: SessionTarget, testID: string) {
    const selected = targetsEqual(target, settings!.target);
    return (
      <Pressable
        key={testID}
        testID={testID}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={() => chooseTarget(target)}
        style={[styles.chip, { backgroundColor: selected ? theme.tint : theme.backgroundElement }]}>
        <ThemedText type="smallBold" style={{ color: selected ? theme.onTint : theme.text }}>
          {targetLabel(target)}
        </ThemedText>
      </Pressable>
    );
  }

  const sections = buildPatternSections(
    PRESETS,
    customPatterns.map(toPattern),
    new Set(favoriteIds),
    query
  );
  const searching = query.trim() !== '';

  function patternRow(pattern: Pattern) {
    const selected = pattern.id === settings!.patternId;
    const custom = !findPreset(pattern.id);
    const favorite = favoriteIds.includes(pattern.id);
    const details = [phaseLine(pattern.phases), pattern.hasHolds ? 'holds' : null, pattern.difficulty ? DIFFICULTY_LABELS[pattern.difficulty] : null]
      .filter(Boolean)
      .join(' · ');
    return (
      <View key={pattern.id} style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
        <Pressable
          testID={`pattern-${pattern.id}`}
          accessibilityRole="button"
          accessibilityState={{ selected }}
          onPress={() => choosePattern(pattern.id)}
          style={styles.rowMain}>
          <ThemedText type={selected ? 'smallBold' : 'default'}>{pattern.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {details}
          </ThemedText>
        </Pressable>
        {custom && (
          <Pressable
            testID={`edit-${pattern.id}`}
            accessibilityLabel={`Edit ${pattern.name}`}
            hitSlop={12}
            onPress={() => router.push({ pathname: '/custom', params: { id: pattern.id } })}
            style={styles.editButton}>
            <ThemedText themeColor="tint">Edit</ThemedText>
          </Pressable>
        )}
        <Pressable
          testID={`fav-${pattern.id}`}
          accessibilityRole="button"
          accessibilityLabel={favorite ? `Remove ${pattern.name} from favourites` : `Add ${pattern.name} to favourites`}
          accessibilityState={{ selected: favorite }}
          hitSlop={8}
          onPress={() => toggleFavorite(pattern.id)}
          style={styles.infoButton}>
          <ThemedText themeColor={favorite ? 'tint' : 'textSecondary'}>{favorite ? '★' : '☆'}</ThemedText>
        </Pressable>
        <Pressable
          testID={`info-${pattern.id}`}
          accessibilityLabel={custom ? `Options for ${pattern.name}` : `About ${pattern.name}`}
          hitSlop={12}
          onPress={() => router.push({ pathname: '/pattern', params: { id: pattern.id } })}
          style={styles.infoButton}>
          <ThemedText themeColor="tint">i</ThemedText>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      testID="patterns-sheet"
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[styles.content, ColumnStyle]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentInsetAdjustmentBehavior="automatic">
      {recent.length > 0 && (
        <>
          <ThemedText type="smallBold">Recent</ThemedText>
          <View style={styles.chips}>
            {recent.map((id) => (
              <Pressable
                key={id}
                testID={`recent-${id}`}
                accessibilityRole="button"
                onPress={() => choosePattern(id)}
                style={[styles.chip, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="smallBold">{nameOf(id)}</ThemedText>
              </Pressable>
            ))}
          </View>
        </>
      )}

      <ThemedText type="smallBold" style={recent.length > 0 ? styles.section : undefined}>
        Length
      </ThemedText>
      <View style={styles.chips}>
        {MINUTE_OPTIONS.map((minutes) => targetChip({ kind: 'minutes', value: minutes }, `duration-${minutes}`))}
        {targetChip({ kind: 'open' }, 'duration-open')}
      </View>
      <View style={styles.chips}>
        {BREATH_OPTIONS.map((breaths) => targetChip({ kind: 'breaths', value: breaths }, `breaths-${breaths}`))}
      </View>
      <Pressable testID="remember-target" accessibilityRole="button" onPress={toggleRemember} hitSlop={8}>
        <ThemedText type="small" themeColor="tint">
          {remembered
            ? `${selectedName} always starts at ${targetLabel(settings.target)}. Tap to forget.`
            : `Remember ${targetLabel(settings.target)} for ${selectedName}`}
        </ThemedText>
      </Pressable>
      <ThemedText type="small" themeColor="textSecondary">
        Studies used five minutes or more.{settings.target.kind === 'open' ? ' Open runs until you end it, at most 2 hours.' : ''}
      </ThemedText>

      <ThemedText type="smallBold" style={styles.section}>
        Pattern
      </ThemedText>
      <TextInput
        testID="pattern-search"
        value={query}
        onChangeText={setQuery}
        placeholder="Search patterns"
        placeholderTextColor={theme.textSecondary}
        accessibilityLabel="Search patterns"
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        returnKeyType="search"
        style={[styles.search, { backgroundColor: theme.backgroundElement, color: theme.text }]}
      />
      {searching ? null : (
        <ThemedText type="small" themeColor="textSecondary">
          Groups show what people often pick for a moment, not results to expect. Star a pattern to keep it at the top.
        </ThemedText>
      )}
      {sections.length === 0 && (
        <ThemedText testID="pattern-no-match" themeColor="textSecondary">
          No pattern matches “{query.trim()}”.
        </ThemedText>
      )}
      {sections.map((section) => (
        <View key={section.key} testID={`section-${section.key}`} style={styles.sectionBlock}>
          <ThemedText type="smallBold" style={styles.sectionTitle}>
            {section.title}
          </ThemedText>
          {section.items.map(patternRow)}
        </View>
      ))}
      <Pressable
        testID="pattern-custom"
        onPress={() => router.push('/custom')}
        style={[styles.row, styles.rowMain, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText themeColor="tint">New custom pattern…</ThemedText>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  section: {
    marginTop: Spacing.three,
  },
  sectionBlock: {
    gap: Spacing.two,
  },
  sectionTitle: {
    marginTop: Spacing.two,
  },
  search: {
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
    minHeight: 40,
    paddingHorizontal: Spacing.three,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    minHeight: 56,
  },
  rowMain: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: 2,
  },
  infoButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButton: {
    minWidth: 56,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
