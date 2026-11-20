import type { ConfigContext, ExpoConfig } from 'expo/config';

import brand from './src/constants/brand.json';

// D24: splash and Android icon background come from the app's identity file, never a literal here.
const IDENTITY = {
  splash: { light: brand.light.background, dark: brand.dark.background },
  iconBackground: brand.light.accent,
};

// One codebase, three installable variants that can sit side by side on a device.
// Select with APP_VARIANT (set by scripts/native.sh and eas.json).
const VARIANTS = {
  development: { name: 'Breathe Well Dev', id: 'com.plainapps.breathe.dev', scheme: 'breathe-dev' },
  preview: { name: 'Breathe Well Preview', id: 'com.plainapps.breathe.preview', scheme: 'breathe-preview' },
  production: { name: 'Breathe Well', id: 'com.plainapps.breathe', scheme: 'breathe' },
} as const;

type Variant = keyof typeof VARIANTS;

// Store build part B (2026-11-07): a Release build of Xcode (expo-constants' "Generate app.config" phase runs this file with
// CONFIGURATION=Release) without APP_VARIANT would embed the DEVELOPMENT config (scheme breathe-dev) in an App Store
// binary. Refuse instead of defaulting (copied from loyalty-cards D54); scripts/check-variant.sh reads the result back.
if (process.env.APP_VARIANT === undefined && /^release/i.test(process.env.CONFIGURATION ?? '')) {
  throw new Error('APP_VARIANT is not set in a Release build. Prefix the command with APP_VARIANT=production (or preview), see docs/RELEASE_KIT.md.');
}
const variant = (process.env.APP_VARIANT ?? 'development') as Variant;
if (!(variant in VARIANTS)) {
  throw new Error(`Unknown APP_VARIANT "${variant}". Use development, preview or production.`);
}
const { name, id, scheme } = VARIANTS[variant];

// Owner step (V3_PLAN "Owner to-dos"): set APPLE_TEAM_ID (your Apple team id) to sign device builds; the widget extension
// and its App Group need it on an iPhone. Simulator builds work without it (V3 P7, like eye-app D67).
const appleTeamId = process.env.APPLE_TEAM_ID || undefined;

// v3 P7.4/P7.5: iOS "Breathe" widget (home screen + Lock Screen) and the session Live Activity via expo-widgets.
// It adds a widget extension target and an App Group (group.<bundle id>). WIDGETS=0 builds without it (Settings
// then hides the Lock Screen option); the default includes it. Android has its own widget (modules/start-widget).
const widgetsEnabled = process.env.WIDGETS !== '0';

const plugins: NonNullable<ExpoConfig['plugins']> = [
  // Must stay first: its mods run last and strip capabilities that libraries add but this app does not use.
  './plugins/with-ios-minimal-capabilities.js',
  // v3.1 F2: Health Connect's privacy-policy links open the in-app policy (must run after react-native-health-connect's mod).
  './plugins/with-health-rationale.js',
  'expo-router',
  ['expo-splash-screen', {
      backgroundColor: IDENTITY.splash.light,
      dark: { backgroundColor: IDENTITY.splash.dark },
      image: './assets/images/splash-icon.png',
      imageWidth: 76,
    }],
  'expo-sqlite',
  // v3 P6 reminders (D50). The notification permission is asked only when the first reminder is added.
  // Icon: 96x96 white on transparent (Android status bar); no push, so no background-remote-notification mode.
  ['expo-notifications', { icon: './assets/images/notification-icon.png', color: IDENTITY.iconBackground }],
  // v3 P6 Health, write-only (D51). iOS: HealthKit entitlement, Mindful Minutes; `background: false` because
  // background delivery (reading) is on by default in the library. Android: Health Connect, minSdk 26.
  [
    '@kingstinct/react-native-healthkit',
    { NSHealthUpdateUsageDescription: 'Breathe Well saves your breathing sessions as Mindful Minutes.', background: false },
  ],
  'react-native-health-connect',
  // Xcode 27 / iOS 27 SDK: apps without the UIScene lifecycle trap at launch (ios.enableSceneSupport: SDK 57 opt-in,
  // expo >= 57.0.23, expo-build-properties >= 57.0.20; SDK 58+ has it by default, then remove it). See docs/DECISIONS.md.
  ['expo-build-properties', { android: { minSdkVersion: 26 }, ios: { enableSceneSupport: true } }],
  // expo-audio's defaults request microphone permission and RECORD_AUDIO for a recording feature
  // this app never uses; disabled to keep the manifest/plist honest (D11 fixed decision 11).
  // enableBackgroundPlayback: true is the actual feature ("keep guiding when locked", D11).
  [
    'expo-audio',
    { microphonePermission: false, recordAudioAndroid: false, enableBackgroundRecording: false, enableBackgroundPlayback: true },
  ],
  // v3 P3 shake-to-pause reads only the accelerometer, which needs no permission. Drop the motion usage
  // string (iOS) and block the pedometer's ACTIVITY_RECOGNITION that the library's manifest merges (Android).
  ['expo-sensors', { motionPermission: false }],
  // v3 P5 History lock. The Face ID text is only shown when the user turns the lock on. Android merges
  // USE_BIOMETRIC / USE_FINGERPRINT (normal permissions, no prompt).
  ['expo-local-authentication', { faceIDPermission: 'Breathe Well uses Face ID to unlock your history.' }],
  // Phones stay portrait; tablets/foldables may rotate (Android; iOS is set in ios.infoPlist below).
  './plugins/with-phone-portrait.js',
  // v3 P7.1 launcher quick actions. Items are set at runtime (src/lib/quick-actions.ts); no static items, no icons.
  'expo-quick-actions',
  // v3 P7.2/P7.3: the Android tile and widget open `<scheme>://start`; the scheme reaches them as manifest meta-data.
  './plugins/with-launch-scheme.js',
];

if (widgetsEnabled) {
  // Registered BEFORE expo-widgets (Xcode mods run last-registered-first, so the extension target exists when they run):
  // the extension gets the app's Apple team (expo writes DEVELOPMENT_TEAM only on the app target; safe-share lesson) and
  // release compiler settings (-O, no debug dylib; expo-widgets writes its Debug settings into Release too, interval-timer P8).
  plugins.push(
    ['./plugins/with-extension-team.js', { appleTeamId, targetName: 'ExpoWidgetsTarget' }],
    './plugins/with-widget-release-settings.js',
  );
  plugins.push([
    'expo-widgets',
    {
      enableAndroid: false,
      widgets: [
        {
          name: 'StartWidget',
          displayName: 'Breathe',
          description: 'Your minutes today; tap to start a session.',
          supportedFamilies: ['systemSmall', 'accessoryCircular', 'accessoryRectangular'],
          contentMarginsDisabled: false,
        },
      ],
    },
  ]);
}

// Dev builds only: expo-dev-client (reopens the last Metro server directly, so Maestro can launch them
// unattended) and the dev-menu defaults tweak. Preview/production must NOT carry these — a release
// build with expo-dev-client compiled in launches through its "Open with" deep-link picker instead of
// straight into the app (found during Phase 8 testing, see DECISIONS).
if (variant === 'development') {
  plugins.push(['expo-dev-client', { launchMode: 'most-recent' }], './plugins/with-dev-menu-defaults.js');
}
// v3.1 F2: release builds (preview, production) drop permissions the app never uses: INTERNET, the overlay and
// settings permissions, storage, push and launcher badges (list and reasons in the plugin). Dev builds need INTERNET.
if (variant !== 'development') {
  plugins.push('./plugins/with-release-permissions.js');
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name,
  slug: 'breathe',
  version: '1.1.0',
  orientation: 'default',
  icon: './assets/images/icon.png',
  scheme,
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: id,
    buildNumber: '3',
    ...(appleTeamId ? { appleTeamId } : {}),
    // App Store Connect export compliance: only the system's own HTTPS (none in the app), no custom encryption.
    config: { usesNonExemptEncryption: false },
    icon: './assets/expo.icon',
    infoPlist: {
      // iPhone stays portrait. (The app is iPhone-only for now; an iPad build would use the ~ipad list.)
      UISupportedInterfaceOrientations: ['UIInterfaceOrientationPortrait'],
      'UISupportedInterfaceOrientations~ipad': [
        'UIInterfaceOrientationPortrait',
        'UIInterfaceOrientationPortraitUpsideDown',
        'UIInterfaceOrientationLandscapeLeft',
        'UIInterfaceOrientationLandscapeRight',
      ],
    },
  },
  android: {
    package: id,
    adaptiveIcon: {
      backgroundColor: IDENTITY.iconBackground,
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    blockedPermissions: ['android.permission.ACTIVITY_RECOGNITION'],
    // WRITE_MINDFULNESS: Health Connect (the toggle asks at the moment it is turned on). SCHEDULE_EXACT_ALARM:
    // lets reminders fire on the minute once the user allows "Alarms & reminders"; never USE_EXACT_ALARM (Play-restricted).
    permissions: ['android.permission.health.WRITE_MINDFULNESS', 'android.permission.SCHEDULE_EXACT_ALARM'],
  },
  plugins,
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    appVariant: variant,
    widgetsEnabled,
  },
});
