import Constants from 'expo-constants';
import { Link, Stack, useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Segmented } from '@/components/segmented';
import { Slider } from '@/components/slider';
import { StartOutsideSection } from '@/components/start-outside-section';
import { ThemedText } from '@/components/themed-text';
import { ToggleRow } from '@/components/toggle-row';
import { ColumnStyle, Spacing } from '@/constants/theme';
import {
  END_SOUND_OPTIONS,
  FADE_DELAY_OPTIONS,
  getAppSettings,
  PREP_OPTIONS,
  setBoolSetting,
  setChoiceSetting,
  setHealthSync,
  setHapticStrength,
  setHaptics,
  setPrepSeconds,
  setVolume,
  VISUAL_OPTIONS,
  type AppSettings,
  type EndSound,
  type FadeDelay,
  type HapticsLevel,
  type PrepSeconds,
  type VisualKind,
} from '@/db/app-settings';
import { getThemePreference, setThemePreference, type ThemePreference } from '@/db/settings';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { ACCENT_KEYS, ACCENTS, setAccent, type AccentKey } from '@/lib/accent';
import { playSample } from '@/lib/audio';
import { playPhaseHaptic } from '@/lib/haptics';
import { healthAppName, healthAvailability, requestHealthPermission } from '@/lib/health';
import { lockUnavailableReason } from '@/lib/history-lock';
import { iosSurfacesAvailable } from '@/lib/ios-surfaces';
import { confirmOwner, getLockCapability } from '@/lib/local-auth';
import { applyThemePreference } from '@/lib/theme-preference';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const HAPTICS_OPTIONS: { value: HapticsLevel; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'on', label: 'On' },
];

const PREP_LABELS: { value: PrepSeconds; label: string }[] = PREP_OPTIONS.map((value) => ({
  value,
  label: value === 0 ? 'Off' : `${value} s`,
}));

const FADE_DELAY_LABELS: { value: FadeDelay; label: string }[] = FADE_DELAY_OPTIONS.map((value) => ({ value, label: `${value} s` }));

const END_SOUND_LABELS: Record<EndSound, string> = { chime: 'Chime', bell: 'Bell', bowl: 'Bowl', none: 'None' };
const END_SOUND_CHOICES = END_SOUND_OPTIONS.map((value) => ({ value, label: END_SOUND_LABELS[value] }));

const VISUAL_LABELS: Record<VisualKind, string> = { orb: 'Orb', ring: 'Ring', bar: 'Bar', text: 'Text' };
const VISUAL_CHOICES = VISUAL_OPTIONS.map((value) => ({ value, label: VISUAL_LABELS[value] }));

const TEXT_SCALE_CHOICES: { value: AppSettings['textScale']; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'large', label: 'Large' },
];

const percent = (value: number) => `${Math.round(value * 100)}%`;

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const theme = useTheme();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [themePreference, setThemeState] = useState<ThemePreference>('system');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [lockNote, setLockNote] = useState('');
  const [healthNote, setHealthNote] = useState('');

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([getThemePreference(db), getAppSettings(db)]).then(([theme_, appSettings]) => {
        if (!active) return;
        setThemeState(theme_);
        setSettings(appSettings);
      });
      return () => {
        active = false;
      };
    }, [db])
  );

  async function chooseTheme(value: ThemePreference) {
    setThemeState(value);
    applyThemePreference(value);
    await setThemePreference(db, value);
  }

  async function chooseHaptics(value: HapticsLevel) {
    setSettings((s) => (s ? { ...s, haptics: value } : s));
    await setHaptics(db, value);
    if (value === 'on' && settings) playPhaseHaptic('inhale', 700, 'on', settings.hapticStrength);
  }

  async function choosePrep(value: PrepSeconds) {
    setSettings((s) => (s ? { ...s, prepSeconds: value } : s));
    await setPrepSeconds(db, value);
  }

  async function toggle(
    key: 'sound' | 'fadeToDark' | 'lockGuidance' | 'startOnOpen' | 'shakeToPause' | 'moodCheckin' | 'milestones' | 'liveActivity',
    value: boolean
  ) {
    setSettings((s) => (s ? { ...s, [key]: value } : s));
    await setBoolSetting(db, key, value);
  }

  /** Switching the History lock on or off asks the phone to confirm it is the owner (this is also when Face ID is first used). */
  async function toggleHistoryLock(value: boolean) {
    setLockNote('');
    if (value) {
      const reason = lockUnavailableReason(await getLockCapability());
      if (reason) {
        setLockNote(reason);
        return;
      }
    }
    if (!(await confirmOwner(value ? 'Turn on the History lock' : 'Turn off the History lock'))) {
      setLockNote('The lock was not changed.');
      return;
    }
    setSettings((s) => (s ? { ...s, historyLock: value } : s));
    await setBoolSetting(db, 'historyLock', value);
  }

  /**
   * Health, write-only. The permission sheet appears here, at the moment the switch is turned on, and never before.
   * If Health is not available, or the permission is refused, the switch stays off and says why.
   */
  async function toggleHealth(value: boolean) {
    setHealthNote('');
    if (!value) {
      setSettings((s) => (s ? { ...s, healthSync: false } : s));
      await setHealthSync(db, false);
      return;
    }
    const availability = await healthAvailability();
    if (!availability.ok) {
      setHealthNote(availability.message);
      return;
    }
    const permission = await requestHealthPermission();
    if (!permission.ok) {
      setHealthNote(permission.message);
      return;
    }
    await setHealthSync(db, true);
    setSettings((s) => (s ? { ...s, healthSync: true } : s));
    setHealthNote(`Sessions from now on are saved to ${healthAppName()}. Deleting one here does not remove it there.`);
  }

  async function choose<K extends 'endSound' | 'fadeDelay' | 'visual' | 'reduceMotion' | 'textScale' | 'accent'>(key: K, value: AppSettings[K]) {
    setSettings((s) => (s ? { ...s, [key]: value } : s));
    await setChoiceSetting(db, key, value);
  }

  async function chooseAccent(value: AccentKey) {
    setAccent(value); // every screen recolours at once
    await choose('accent', value);
  }

  async function chooseEndSound(value: EndSound) {
    await choose('endSound', value);
    playSample(value, settings?.volume ?? 1);
  }

  if (!settings) return null;

  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Pressable
              testID="back"
              accessibilityLabel="Home"
              hitSlop={12}
              onPress={() => router.back()}
              style={styles.backButton}>
              <ThemedText themeColor="tint">Home</ThemedText>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        testID="settings-screen"
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={[styles.content, ColumnStyle]}
        contentInsetAdjustmentBehavior="automatic">
        <ThemedText type="smallBold">Session</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Get ready countdown
        </ThemedText>
        <Segmented options={PREP_LABELS} value={settings.prepSeconds} onChange={choosePrep} testIdPrefix="prep" />
        <ToggleRow
          testID="toggle-fade"
          label="Fade to dark"
          detail="Dims the screen after your last touch so you can close your eyes."
          value={settings.fadeToDark}
          onChange={(v) => toggle('fadeToDark', v)}
        />
        {settings.fadeToDark && (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              Fade after
            </ThemedText>
            <Segmented
              options={FADE_DELAY_LABELS}
              value={settings.fadeDelay}
              onChange={(v) => choose('fadeDelay', v)}
              testIdPrefix="fade-delay"
            />
          </>
        )}
        <ToggleRow
          testID="toggle-lock-guidance"
          label="Keep guiding when locked"
          detail="Tones and haptics stay on the beat while the phone is locked. Android shows a session notification with Pause and End. On iPhone, haptics stop while locked (a platform limit); tones continue. Tones play even with Sound off or on silent."
          value={settings.lockGuidance}
          onChange={(v) => toggle('lockGuidance', v)}
        />
        {iosSurfacesAvailable() && (
          <ToggleRow
            testID="toggle-live-activity"
            label="Show the session on the Lock Screen"
            detail="A Live Activity with the pattern and the time left, on the Lock Screen and in the Dynamic Island. Your iPhone may ask once whether to allow it."
            value={settings.liveActivity}
            onChange={(v) => toggle('liveActivity', v)}
          />
        )}
        <ToggleRow
          testID="toggle-shake"
          label="Shake to pause"
          detail="Shake the phone to pause a running session. Uses the motion sensor only; no permission needed."
          value={settings.shakeToPause}
          onChange={(v) => toggle('shakeToPause', v)}
        />
        <ToggleRow
          testID="toggle-start-on-open"
          label="Start when opened"
          detail="Opening the app starts your default session, no tap needed."
          value={settings.startOnOpen}
          onChange={(v) => toggle('startOnOpen', v)}
        />

        <ThemedText type="smallBold" style={styles.section}>
          Guidance
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Haptics
        </ThemedText>
        <Segmented options={HAPTICS_OPTIONS} value={settings.haptics} onChange={chooseHaptics} testIdPrefix="haptics" />
        {settings.haptics === 'on' && (
          <Slider
            testID="strength"
            label="Haptic strength"
            value={settings.hapticStrength}
            min={0.1}
            max={1}
            step={0.05}
            display={percent(settings.hapticStrength)}
            onChange={(v) => setSettings((s) => (s ? { ...s, hapticStrength: v } : s))}
            onCommit={(v) => {
              setHapticStrength(db, v).catch(() => {});
              playPhaseHaptic('inhale', 700, 'on', v);
            }}
          />
        )}
        <ToggleRow testID="toggle-sound" label="Sound" value={settings.sound} onChange={(v) => toggle('sound', v)} />
        {settings.sound && (
          <>
            <Slider
              testID="volume"
              label="Volume"
              value={settings.volume}
              min={0}
              max={1}
              step={0.05}
              display={percent(settings.volume)}
              onChange={(v) => setSettings((s) => (s ? { ...s, volume: v } : s))}
              onCommit={(v) => {
                setVolume(db, v).catch(() => {});
                playSample('inhale', v);
              }}
            />
            <ThemedText type="small" themeColor="textSecondary">
              End sound
            </ThemedText>
            <Segmented options={END_SOUND_CHOICES} value={settings.endSound} onChange={chooseEndSound} testIdPrefix="endsound" />
          </>
        )}

        <ThemedText type="smallBold" style={styles.section}>
          Appearance
        </ThemedText>
        <Segmented options={THEME_OPTIONS} value={themePreference} onChange={chooseTheme} testIdPrefix="theme" />
        <ThemedText type="small" themeColor="textSecondary">
          Colour
        </ThemedText>
        <View style={styles.accents}>
          {ACCENT_KEYS.map((key) => {
            const selected = settings.accent === key;
            return (
              <Pressable
                key={key}
                testID={`accent-${key}`}
                accessibilityRole="button"
                accessibilityLabel={ACCENTS[key].label}
                accessibilityState={{ selected }}
                onPress={() => chooseAccent(key)}
                style={[styles.accent, { backgroundColor: theme.backgroundElement }, selected && { borderColor: theme.text }]}>
                <View style={[styles.accentDot, { backgroundColor: ACCENTS[key][scheme] }]} />
              </Pressable>
            );
          })}
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          Breathing visual
        </ThemedText>
        <Segmented options={VISUAL_CHOICES} value={settings.visual} onChange={(v) => choose('visual', v)} testIdPrefix="visual" />
        <ToggleRow
          testID="toggle-reduce-motion"
          label="Reduce motion"
          detail="The visual fades instead of moving. Your phone's own reduce-motion setting turns this on too."
          value={settings.reduceMotion === 'on'}
          onChange={(v) => choose('reduceMotion', v ? 'on' : 'system')}
        />
        <ThemedText type="small" themeColor="textSecondary">
          Text size (the phase word; your phone&apos;s font size applies too)
        </ThemedText>
        <Segmented options={TEXT_SCALE_CHOICES} value={settings.textScale} onChange={(v) => choose('textScale', v)} testIdPrefix="text" />

        <ThemedText type="smallBold" style={styles.section}>
          Reminders
        </ThemedText>
        <Link href="/reminders" asChild>
          <Pressable testID="open-reminders" style={StyleSheet.flatten([styles.linkRow, { backgroundColor: theme.backgroundElement }])}>
            <ThemedText>Reminders</ThemedText>
          </Pressable>
        </Link>
        <ThemedText type="small" themeColor="textSecondary">
          None are set up until you add one. Your phone asks for permission only then.
        </ThemedText>

        <ThemedText type="smallBold" style={styles.section}>
          Health
        </ThemedText>
        <ToggleRow
          testID="toggle-health"
          label={Platform.OS === 'ios' ? 'Save sessions to Apple Health' : 'Save sessions to Health Connect'}
          detail={
            Platform.OS === 'ios'
              ? 'Each session is saved as Mindful Minutes. Write-only: Breathe Well never reads your Health data. Your phone asks for permission when you turn this on.'
              : 'Each session is saved as a breathing session. Write-only: Breathe Well never reads your Health data. Your phone asks for permission when you turn this on.'
          }
          value={settings.healthSync}
          onChange={toggleHealth}
        />
        {healthNote !== '' && (
          <ThemedText testID="health-note" type="small" themeColor="textSecondary">
            {healthNote}
          </ThemedText>
        )}

        <ThemedText type="smallBold" style={styles.section}>
          Privacy &amp; data
        </ThemedText>
        <ToggleRow
          testID="toggle-history-lock"
          label="Lock History"
          detail="Ask for Face ID, a fingerprint or your phone's passcode before History, its details and export open. The breathing screen is never locked."
          value={settings.historyLock}
          onChange={toggleHistoryLock}
        />
        {lockNote !== '' && (
          <ThemedText testID="lock-note" type="small" themeColor="textSecondary">
            {lockNote}
          </ThemedText>
        )}
        <ToggleRow
          testID="toggle-mood"
          label="Mood check-in"
          detail="Optional one-tap 1 to 5 before and after a session, saved with it. You can always skip it. No score, no advice."
          value={settings.moodCheckin}
          onChange={(v) => toggle('moodCheckin', v)}
        />
        <ToggleRow
          testID="toggle-milestones"
          label="Milestones"
          detail="A quiet list in History of what you have done, such as your first session or 60 minutes. Nothing to keep up, no reminders."
          value={settings.milestones}
          onChange={(v) => toggle('milestones', v)}
        />
        <Link href="/data" asChild>
          <Pressable testID="open-data-settings" style={StyleSheet.flatten([styles.linkRow, { backgroundColor: theme.backgroundElement }])}>
            <ThemedText>Export, back up or delete</ThemedText>
          </Pressable>
        </Link>
        <Link href="/privacy" asChild>
          <Pressable testID="open-privacy-settings" style={StyleSheet.flatten([styles.linkRow, { backgroundColor: theme.backgroundElement }])}>
            <ThemedText>Privacy policy</ThemedText>
          </Pressable>
        </Link>

        <StartOutsideSection />

        <ThemedText type="smallBold" style={styles.section}>
          More
        </ThemedText>
        <Link href="/history" asChild>
          <Pressable testID="open-history" style={StyleSheet.flatten([styles.linkRow, { backgroundColor: theme.backgroundElement }])}>
            <ThemedText>History</ThemedText>
          </Pressable>
        </Link>
        <Link href="/about" asChild>
          <Pressable testID="open-about" style={StyleSheet.flatten([styles.linkRow, { backgroundColor: theme.backgroundElement }])}>
            <ThemedText>About</ThemedText>
          </Pressable>
        </Link>

        <ThemedText type="small" themeColor="textSecondary" style={styles.section}>
          Version {Constants.expoConfig?.version} ({String(Constants.expoConfig?.extra?.appVariant)})
        </ThemedText>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  backButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    marginLeft: -Spacing.two,
  },
  section: {
    marginTop: Spacing.four,
  },
  accents: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  accent: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accentDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  linkRow: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
  },
});
