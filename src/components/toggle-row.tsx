import { StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function ToggleRow({
  testID,
  label,
  detail,
  value,
  onChange,
}: {
  testID: string;
  label: string;
  detail?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleLabel}>
        <ThemedText type="default">{label}</ThemedText>
        {detail ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.toggleDetail}>
            {detail}
          </ThemedText>
        ) : null}
      </View>
      <Switch testID={testID} value={value} onValueChange={onChange} trackColor={{ true: theme.tint }} />
    </View>
  );
}

const styles = StyleSheet.create({
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    gap: Spacing.three,
  },
  toggleLabel: {
    flex: 1,
  },
  toggleDetail: {
    marginTop: 2,
  },
});
