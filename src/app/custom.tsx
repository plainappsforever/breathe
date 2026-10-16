import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ColumnStyle, Spacing } from '@/constants/theme';
import { setPattern } from '@/db/app-settings';
import { createCustomPattern, deleteCustomPattern, duplicateCustomPattern, getCustomPattern, updateCustomPattern } from '@/db/custom-patterns';
import { useTheme } from '@/hooks/use-theme';
import {
  customInputFromPhases,
  DEFAULT_CUSTOM_NAME,
  formatSeconds,
  MAX_PATTERN_NAME_LENGTH,
  MAX_PHASE_SECONDS,
  MIN_PHASE_SECONDS,
  PHASE_STEP_SECONDS,
  phaseLine,
  validateCustomPattern,
  type CustomInput,
} from '@/lib/patterns';

const DEFAULT_CUSTOM: CustomInput = { inSeconds: 4, sipSeconds: 0, hold1Seconds: 0, outSeconds: 6, hold2Seconds: 0 };

function Stepper({
  testId,
  label,
  value,
  min,
  onChange,
}: {
  testId: string;
  label: string;
  value: number;
  min: number;
  onChange: (value: number) => void;
}) {
  const theme = useTheme();
  const clamp = (v: number) => Math.min(MAX_PHASE_SECONDS, Math.max(min, Math.round(v * 2) / 2));
  return (
    <View style={styles.stepperRow}>
      <ThemedText style={styles.stepperLabel}>{label}</ThemedText>
      <View style={[styles.stepperControl, { backgroundColor: theme.backgroundElement }]}>
        <Pressable
          testID={`${testId}-decrease`}
          accessibilityLabel={`Decrease ${label}`}
          hitSlop={8}
          onPress={() => onChange(clamp(value - PHASE_STEP_SECONDS))}
          style={styles.stepperButton}>
          <ThemedText type="title" style={styles.stepperGlyph}>
            −
          </ThemedText>
        </Pressable>
        <ThemedText testID={`${testId}-value`} type="smallBold" style={styles.stepperValue}>
          {formatSeconds(value)}s
        </ThemedText>
        <Pressable
          testID={`${testId}-increase`}
          accessibilityLabel={`Increase ${label}`}
          hitSlop={8}
          onPress={() => onChange(clamp(value + PHASE_STEP_SECONDS))}
          style={styles.stepperButton}>
          <ThemedText type="title" style={styles.stepperGlyph}>
            +
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

export default function CustomScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [name, setName] = useState(DEFAULT_CUSTOM_NAME);
  const [input, setInput] = useState<CustomInput>(DEFAULT_CUSTOM);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Editing an existing pattern loads it once; a new one starts from the defaults.
  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let active = true;
      getCustomPattern(db, id).then((record) => {
        if (!active || !record) return;
        setName(record.name);
        setInput(customInputFromPhases(record.phases));
      });
      return () => {
        active = false;
      };
    }, [db, id])
  );

  const validation = validateCustomPattern(input);

  async function save() {
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    if (id) {
      await updateCustomPattern(db, id, { name, values: input });
      router.back();
      return;
    }
    const created = await createCustomPattern(db, { name, values: input });
    await setPattern(db, created.id);
    // Custom is pushed on top of the Patterns modal, so a single back() would only return to Patterns.
    router.dismissAll();
  }

  async function duplicate() {
    if (!id) return;
    await duplicateCustomPattern(db, id);
    router.back();
  }

  async function remove() {
    if (!id) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await deleteCustomPattern(db, id);
    router.back();
  }

  return (
    <ScrollView
      testID="custom-screen"
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[styles.content, ColumnStyle]}
      contentInsetAdjustmentBehavior="automatic">
      <TextInput
        testID="custom-name"
        accessibilityLabel="Pattern name"
        value={name}
        onChangeText={setName}
        maxLength={MAX_PATTERN_NAME_LENGTH}
        placeholder={DEFAULT_CUSTOM_NAME}
        placeholderTextColor={theme.textSecondary}
        returnKeyType="done"
        style={[styles.nameInput, { backgroundColor: theme.backgroundElement, color: theme.text }]}
      />
      <Stepper testId="stepper-in" label="In" value={input.inSeconds} min={MIN_PHASE_SECONDS} onChange={(v) => setInput((s) => ({ ...s, inSeconds: v }))} />
      <Stepper testId="stepper-sip" label="Sip (second inhale)" value={input.sipSeconds} min={0} onChange={(v) => setInput((s) => ({ ...s, sipSeconds: v }))} />
      <Stepper testId="stepper-hold1" label="Hold" value={input.hold1Seconds} min={0} onChange={(v) => setInput((s) => ({ ...s, hold1Seconds: v }))} />
      <Stepper testId="stepper-out" label="Out" value={input.outSeconds} min={MIN_PHASE_SECONDS} onChange={(v) => setInput((s) => ({ ...s, outSeconds: v }))} />
      <Stepper testId="stepper-hold2" label="Hold" value={input.hold2Seconds} min={0} onChange={(v) => setInput((s) => ({ ...s, hold2Seconds: v }))} />

      <ThemedText testID="custom-phase-line" themeColor="textSecondary" style={styles.phaseLine}>
        {validation.ok ? phaseLine(validation.phases) : 'Adjust the values below'}
      </ThemedText>

      {error && !validation.ok ? (
        <ThemedText testID="custom-error" themeColor="danger">
          {validation.error}
        </ThemedText>
      ) : null}

      <Button testID="save-custom" label="Save" onPress={save} disabled={!validation.ok} />
      {id ? (
        <View style={styles.secondaryActions}>
          <Button testID="duplicate-custom" variant="secondary" label="Duplicate" onPress={duplicate} style={styles.secondaryButton} />
          <Button
            testID="delete-custom"
            variant="secondary"
            label={confirmDelete ? 'Tap again to delete' : 'Delete'}
            onPress={remove}
            style={styles.secondaryButton}
          />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  nameInput: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  secondaryButton: {
    flex: 1,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  stepperLabel: {
    flex: 1,
  },
  stepperControl: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
  },
  stepperButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperGlyph: {
    fontSize: 22,
    lineHeight: 24,
  },
  stepperValue: {
    minWidth: 48,
    textAlign: 'center',
  },
  phaseLine: {
    textAlign: 'center',
  },
});
