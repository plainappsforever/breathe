import Constants from 'expo-constants';
import { Link } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ColumnStyle, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { EVIDENCE_LINKS, EVIDENCE_POINTS, SAFETY_LINE, SAFETY_LINKS, SAFETY_POINTS, type AboutPoint } from '@/lib/about-content';
import { appScheme } from '@/lib/app-scheme';
import { SHORTCUT_EXAMPLES } from '@/lib/entry-points';
import { buildLaunchUrl } from '@/lib/launch-intent';
import { CATEGORY_LABELS, CATEGORY_ORDER, PRESETS, type StudyLink } from '@/lib/patterns';

function Points({ points }: { points: readonly AboutPoint[] }) {
  return (
    <>
      {points.map((point) => (
        <ThemedText key={point.title} type="small" themeColor="textSecondary">
          <ThemedText type="smallBold">{point.title}. </ThemedText>
          {point.text}
        </ThemedText>
      ))}
    </>
  );
}

function Links({ links }: { links: readonly StudyLink[] }) {
  return (
    <>
      {links.map((link) => (
        <Pressable key={link.url} accessibilityRole="link" hitSlop={6} onPress={() => WebBrowser.openBrowserAsync(link.url)}>
          <ThemedText type="small" themeColor="tint">
            {link.label}
          </ThemedText>
        </Pressable>
      ))}
    </>
  );
}

export default function AboutScreen() {
  const theme = useTheme();
  const scheme = appScheme();

  return (
    <ScrollView
      testID="about-screen"
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[styles.content, ColumnStyle]}
      contentInsetAdjustmentBehavior="automatic">
      <ThemedText type="default">
        Breathe Well is the fastest, least annoying way to deliberately slow down for a few minutes: open
        the app, tap once, breathe with your eyes closed, guided by haptics and soft tones.
      </ThemedText>

      <ThemedText type="smallBold" style={styles.section}>
        Safety
      </ThemedText>
      <ThemedText testID="about-safety-line" themeColor="textSecondary">
        {SAFETY_LINE}
      </ThemedText>
      <Points points={SAFETY_POINTS} />
      <Links links={SAFETY_LINKS} />

      <ThemedText type="smallBold" style={styles.section}>
        How to read the evidence
      </ThemedText>
      <Points points={EVIDENCE_POINTS} />
      <Links links={EVIDENCE_LINKS} />

      <ThemedText type="smallBold" style={styles.section}>
        The evidence behind each pattern
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Tap the i next to a pattern in the list for the longer version.
      </ThemedText>
      {CATEGORY_ORDER.map((category) => (
        <View key={category} style={styles.group}>
          <ThemedText type="smallBold">{CATEGORY_LABELS[category]}</ThemedText>
          {PRESETS.filter((pattern) => pattern.category === category).map((pattern) => (
            <ThemedText key={pattern.id} testID={`about-note-${pattern.id}`} type="small" themeColor="textSecondary">
              <ThemedText type="smallBold">{pattern.name}. </ThemedText>
              {pattern.evidenceNote}
              {pattern.about?.studies.length ? (
                <ThemedText type="small">
                  {' ('}
                  {pattern.about.studies.map((link, i) => (
                    <ThemedText key={link.url} type="link" themeColor="tint" onPress={() => WebBrowser.openBrowserAsync(link.url)}>
                      {i > 0 ? ', ' : ''}
                      {link.label}
                    </ThemedText>
                  ))}
                  )
                </ThemedText>
              ) : null}
            </ThemedText>
          ))}
        </View>
      ))}

      <ThemedText type="smallBold" style={styles.section}>
        Start from a shortcut
      </ThemedText>
      {Platform.OS === 'ios' ? (
        <ThemedText testID="about-shortcuts" themeColor="textSecondary">
          Any shortcut can start a session with a link. In the Shortcuts app: New Shortcut, add the action
          &quot;Open URLs&quot;, paste a link from below and name it, for example &quot;Breathe&quot;. Then choose it in
          Settings, Action Button, Shortcut (iPhone 15 Pro and later), or say &quot;Hey Siri&quot; and its name.
        </ThemedText>
      ) : (
        <ThemedText testID="about-shortcuts" themeColor="textSecondary">
          Besides the Quick Settings tile and the home-screen widget, any automation app that can open a link can
          start a session with one of the links below.
        </ThemedText>
      )}
      {SHORTCUT_EXAMPLES.map((example) => (
        <ThemedText key={example.label} testID={`shortcut-link-${example.id}`} type="small" themeColor="textSecondary" selectable>
          <ThemedText type="smallBold">{example.label}: </ThemedText>
          <ThemedText type="small">
            {buildLaunchUrl(scheme, example.params)}
          </ThemedText>
        </ThemedText>
      ))}
      <ThemedText type="small" themeColor="textSecondary">
        pattern= takes a pattern name in lower case ({PRESETS.map((p) => p.id).join(', ')}); target= takes m:5 for 5
        minutes, b:20 for 20 breaths, or open.
      </ThemedText>

      <ThemedText type="smallBold" style={styles.section}>
        Privacy
      </ThemedText>
      <ThemedText testID="about-privacy" themeColor="textSecondary">
        This app collects no data. Everything stays on this device: no account, no analytics, no ads. The app itself
        makes no network requests. Study links open your browser only when you tap one.
      </ThemedText>
      <Link href="/privacy" asChild>
        <Pressable testID="open-privacy" accessibilityRole="link" hitSlop={6}>
          <ThemedText type="small" themeColor="tint">
            Privacy policy
          </ThemedText>
        </Pressable>
      </Link>

      <ThemedText type="small" themeColor="textSecondary" style={styles.section}>
        Version {Constants.expoConfig?.version} ({String(Constants.expoConfig?.extra?.appVariant)})
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
  group: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
});
