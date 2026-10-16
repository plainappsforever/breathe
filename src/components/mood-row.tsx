import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The optional mood check-in (V3 P5): five plain buttons, 1 (low) to 5 (good). Tapping the chosen one again
 * clears it; ignoring the row is the same as skipping. No score, no colour judgement.
 */
export function MoodRow({
  label,
  value,
  onChange,
  testIdPrefix,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  testIdPrefix: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <View style={styles.row}>
        <ThemedText type="small" themeColor="textSecondary">
          low
        </ThemedText>
        {[1, 2, 3, 4, 5].map((n) => {
          const selected = value === n;
          return (
            <Pressable
              key={n}
              testID={`${testIdPrefix}-${n}`}
              accessibilityRole="button"
              accessibilityLabel={`${n} of 5`}
              accessibilityState={{ selected }}
              hitSlop={4}
              onPress={() => onChange(selected ? null : n)}
              style={[styles.dot, { backgroundColor: selected ? theme.tint : theme.backgroundElement }]}>
              <ThemedText type="smallBold" style={{ color: selected ? theme.onTint : theme.text }}>
                {n}
              </ThemedText>
            </Pressable>
          );
        })}
        <ThemedText type="small" themeColor="textSecondary">
          good
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
