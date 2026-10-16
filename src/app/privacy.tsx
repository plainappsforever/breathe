import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ColumnStyle, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isPlaceholderPolicyUrl, POLICY_CONTACT, POLICY_DATE, POLICY_PROVIDER, POLICY_SECTIONS, PRIVACY_POLICY_URL } from '@/lib/privacy-policy';

/**
 * The privacy policy inside the app (v3.1 F2). Reached from Settings and About, and on Android from Health
 * Connect's "Read privacy policy" / "Permission usage" (the `<scheme>://privacy` link that
 * modules/quick-tile PrivacyLinkActivity opens, REVIEW_V3 #2). Works offline; the hosted copy is optional.
 */
export default function PrivacyScreen() {
  const theme = useTheme();
  const router = useRouter();
  const online = !isPlaceholderPolicyUrl();

  return (
    <ScrollView
      testID="privacy-screen"
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[styles.content, ColumnStyle]}
      contentInsetAdjustmentBehavior="automatic">
      <ThemedText type="subtitle">Privacy policy</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Last updated: {POLICY_DATE}
        {'\n'}Provider: {POLICY_PROVIDER}
        {'\n'}Contact: {POLICY_CONTACT}
      </ThemedText>
      {online && (
        <Pressable testID="privacy-online-link" accessibilityRole="link" hitSlop={6} onPress={() => WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL)}>
          <ThemedText type="small" themeColor="tint">
            Read it online
          </ThemedText>
        </Pressable>
      )}
      {POLICY_SECTIONS.map((section) => (
        <View key={section.title} style={styles.section}>
          <ThemedText type="smallBold">{section.title}</ThemedText>
          {section.paragraphs?.map((text) => (
            <ThemedText key={text} type="small" themeColor="textSecondary">
              {text}
            </ThemedText>
          ))}
          {section.bullets?.map((text) => (
            <ThemedText key={text} type="small" themeColor="textSecondary">
              {'•  '}
              {text}
            </ThemedText>
          ))}
          {section.after?.map((text) => (
            <ThemedText key={text} type="small" themeColor="textSecondary">
              {text}
            </ThemedText>
          ))}
        </View>
      ))}
      <Pressable
        testID="privacy-close"
        accessibilityRole="button"
        hitSlop={12}
        style={styles.section}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
        <ThemedText type="smallBold" themeColor="tint">
          Close
        </ThemedText>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    gap: Spacing.two,
    paddingBottom: Spacing.six,
  },
  section: {
    marginTop: Spacing.three,
    gap: Spacing.one,
  },
});
