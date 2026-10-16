import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

/** Header back button with a fixed testID: the native Android one is not reliably reachable from Maestro (same fix as Settings). */
export function BackButton({ label = 'Back' }: { label?: string }) {
  const router = useRouter();
  return (
    <Pressable testID="back" accessibilityRole="button" accessibilityLabel={label} hitSlop={12} onPress={() => router.back()} style={styles.button}>
      <ThemedText themeColor="tint">{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    marginLeft: -Spacing.two,
  },
});
