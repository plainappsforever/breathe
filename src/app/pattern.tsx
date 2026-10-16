import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { ColumnStyle, Spacing } from '@/constants/theme';
import { getAppSettings, setTarget } from '@/db/app-settings';
import { getCustomPattern } from '@/db/custom-patterns';
import { getPatternPrefs, setPatternOverride, setPatternTarget, type PatternPrefs } from '@/db/pattern-prefs';
import { useTheme } from '@/hooks/use-theme';
import {
  BREATH_OPTIONS,
  CATEGORY_LABELS,
  DIFFICULTY_LABELS,
  findPreset,
  MINUTE_OPTIONS,
  paceLabel,
  phaseLine,
  targetLabel,
  targetsEqual,
  type Pattern,
  type Phase,
  type SessionTarget,
} from '@/lib/patterns';

type Choice = 'default' | 'on' | 'off';
const CHOICES: { value: Choice; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];

function toChoice(value: string | boolean | null): Choice {
  if (value === null) return 'default';
  return value === true || value === 'on' ? 'on' : 'off';
}

type Loaded = { name: string; phases: readonly Phase[]; preset: Pattern | null; custom: boolean };

/**
 * A pattern's own choices (V3 P3): length, haptics, sound and fade to dark. "Default" follows the global
 * setting. Stored in `pattern_prefs`, so a pattern together with these choices is the session preset.
 */
export default function PatternScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [prefs, setPrefs] = useState<PatternPrefs | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        if (!id) return;
        const preset = findPreset(id);
        const record = preset ? null : await getCustomPattern(db, id);
        const [stored, settings] = await Promise.all([getPatternPrefs(db, id), getAppSettings(db)]);
        if (!active) return;
        if (preset) setLoaded({ name: preset.name, phases: preset.phases, preset, custom: false });
        else if (record) setLoaded({ name: record.name, phases: record.phases, preset: null, custom: true });
        setPrefs(stored);
        setSelectedId(settings.patternId);
      })().catch(() => {});
      return () => {
        active = false;
      };
    }, [db, id])
  );

  if (!id || !loaded) return null;

  async function refresh() {
    setPrefs(await getPatternPrefs(db, id!));
  }

  async function chooseOverride(field: 'haptics' | 'sound' | 'fade', choice: Choice) {
    const value = choice === 'default' ? null : field === 'haptics' ? choice : choice === 'on';
    await setPatternOverride(db, id!, field, value);
    await refresh();
  }

  async function chooseTarget(target: SessionTarget | null) {
    await setPatternTarget(db, id!, target);
    // The selected pattern is what Home shows: it follows the new length straight away.
    if (target && id === selectedId) await setTarget(db, target);
    await refresh();
  }

  function targetChip(target: SessionTarget | null, testID: string, label: string) {
    const selected = target === null ? prefs?.target == null : prefs?.target != null && targetsEqual(prefs.target, target);
    return (
      <Pressable
        key={testID}
        testID={testID}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={() => chooseTarget(target)}
        style={[styles.chip, { backgroundColor: selected ? theme.tint : theme.backgroundElement }]}>
        <ThemedText type="smallBold" style={{ color: selected ? theme.onTint : theme.text }}>
          {label}
        </ThemedText>
      </Pressable>
    );
  }

  return (
    <ScrollView
      testID="pattern-detail"
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[styles.content, ColumnStyle]}
      contentInsetAdjustmentBehavior="automatic">
      <ThemedText testID="pattern-detail-name" type="subtitle">
        {loaded.name}
      </ThemedText>
      <ThemedText themeColor="textSecondary">{phaseLine(loaded.phases)}</ThemedText>
      <ThemedText testID="pattern-pace" type="small" themeColor="textSecondary">
        {paceLabel(loaded.phases)}
        {loaded.preset?.category && loaded.preset.difficulty
          ? ` · ${CATEGORY_LABELS[loaded.preset.category]} · ${DIFFICULTY_LABELS[loaded.preset.difficulty]}`
          : ''}
      </ThemedText>
      {loaded.preset?.caution ? (
        <ThemedText testID="pattern-caution" type="smallBold">
          {loaded.preset.caution}
        </ThemedText>
      ) : null}
      {loaded.preset && (
        <ThemedText testID="pattern-evidence-note" type="small" themeColor="textSecondary">
          {loaded.preset.evidenceNote}
        </ThemedText>
      )}
      {loaded.preset?.about && (
        <>
          <ThemedText type="smallBold" style={styles.section}>
            About this pattern
          </ThemedText>
          <ThemedText testID="pattern-about-what" type="small" themeColor="textSecondary">
            {loaded.preset.about.what}
          </ThemedText>
          <ThemedText type="smallBold" style={styles.label}>
            What studies exist
          </ThemedText>
          {loaded.preset.about.studies.map((study) => (
            <Pressable key={study.url} testID="pattern-study-link" accessibilityRole="link" hitSlop={6} onPress={() => WebBrowser.openBrowserAsync(study.url)}>
              <ThemedText type="small" themeColor="tint">
                {study.label}
              </ThemedText>
            </Pressable>
          ))}
          <ThemedText type="smallBold" style={styles.label}>
            What is uncertain
          </ThemedText>
          <ThemedText testID="pattern-about-uncertain" type="small" themeColor="textSecondary">
            {loaded.preset.about.uncertain}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
            For relaxation only, not a treatment. See About for safety.
          </ThemedText>
        </>
      )}
      {loaded.custom && (
        <Pressable testID="pattern-edit" accessibilityRole="button" hitSlop={8} onPress={() => router.replace({ pathname: '/custom', params: { id } })}>
          <ThemedText type="smallBold" themeColor="tint">
            Edit timing
          </ThemedText>
        </Pressable>
      )}

      <ThemedText type="smallBold" style={styles.section}>
        For this pattern only
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Default follows your Settings. A choice here applies only when you breathe with {loaded.name}.
      </ThemedText>

      <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
        Length
      </ThemedText>
      <View style={styles.chips}>
        {targetChip(null, 'pt-target-default', 'Default')}
        {MINUTE_OPTIONS.map((minutes) => targetChip({ kind: 'minutes', value: minutes }, `pt-target-m${minutes}`, targetLabel({ kind: 'minutes', value: minutes })))}
        {targetChip({ kind: 'open' }, 'pt-target-open', 'Open')}
      </View>
      <View style={styles.chips}>
        {BREATH_OPTIONS.map((breaths) => targetChip({ kind: 'breaths', value: breaths }, `pt-target-b${breaths}`, targetLabel({ kind: 'breaths', value: breaths })))}
      </View>

      <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
        Haptics
      </ThemedText>
      <Segmented options={CHOICES} value={toChoice(prefs?.haptics ?? null)} onChange={(v) => chooseOverride('haptics', v)} testIdPrefix="pt-haptics" />
      <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
        Sound
      </ThemedText>
      <Segmented options={CHOICES} value={toChoice(prefs?.sound ?? null)} onChange={(v) => chooseOverride('sound', v)} testIdPrefix="pt-sound" />
      <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
        Fade to dark
      </ThemedText>
      <Segmented options={CHOICES} value={toChoice(prefs?.fade ?? null)} onChange={(v) => chooseOverride('fade', v)} testIdPrefix="pt-fade" />

      <Pressable
        testID="pattern-done"
        accessibilityRole="button"
        onPress={() => router.back()}
        style={[styles.done, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="smallBold">Done</ThemedText>
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
    marginTop: Spacing.four,
  },
  label: {
    marginTop: Spacing.two,
  },
  done: {
    marginTop: Spacing.four,
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
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
});
