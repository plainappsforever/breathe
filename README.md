# Breathe Well

Paced breathing with vibration and tones. No ads, no account, works offline.

Open the app, tap once, and breathe. Breathe Well guides slow, paced breathing with soft tones and vibration, so you can close your eyes and follow by feel and sound.

**Get it:** [App Store](https://plainapps.dfdsfdsfsdf.workers.dev/apps/breathe/) · [Google Play](https://plainapps.dfdsfdsfsdf.workers.dev/apps/breathe/) · [GitHub Releases](https://github.com/plainappsforever/breathe/releases) ·
[Obtainium](https://apps.obtainium.imranr.dev/redirect?r=obtainium://add/https://github.com/plainappsforever/breathe)

**Status:** first store release pending.

## Our promise

**Free, no ads, no tracking, no accounts.** This app keeps your data on your phone. It has no analytics, no crash
reporter, no advertising SDK and no sign-in. We will not sell this app or this project to a company
that changes any of this.

Why we write it down: in 2023 a popular open-source Android suite was sold to an ad-funded app company and its store
listings started saying "Contains ads"; its community had to fork it to keep a clean version. The source code of
Breathe Well is published under GPL-3.0, so if this promise were ever broken, anyone could continue the last
version that kept it.

## What it does

No account. No ads. No subscription. No tips. Works offline. Nothing is sold or asked for before, during or after a session.

BREATHE
• Twelve patterns: Slow, Sigh, Even, Box, 4-7-8, Long exhale, three Resonance paces, Triangle, Easy box and Short sigh, plus your own library of custom patterns. Search, favourites and recent patterns.
• Choose a length in minutes (up to 60), a number of breaths, or open-ended. "End after this breath" and an optional get-ready countdown.
• Guidance by vibration and tones, with a strength slider, volume, four end sounds and four looks (orb, ring, bar, text). The screen fades to dark so you can keep your eyes closed. Phones without fine vibration control give one plain tap per phase.
• Optional "Keep guiding when locked": a small built-in scheduler keeps every tone and buzz on time with the screen off, with a notification (Pause, End), headset-button support, and a pause on a phone call (Android 12 and newer).
• Optional shake to pause.
• No fast, forced or breath-retention techniques. Patterns that include breath holds say so and carry a caution.

KNOW WHAT YOU ARE DOING
Every pattern has an "About this pattern" page: what it is, which studies exist and what is not known. Some patterns have no study of their own, and the page says so.

START FASTER
• Quick Settings tile and home-screen widget (minutes today, one tap to start).
• Long-press the app icon: "Breathe now" plus your two recent patterns.
• Any automation app that can open a link can start a session: breathe://start?pattern=box&target=m:5

YOUR HISTORY STAYS YOURS
• Totals, a 12-week calendar, the last 14 days, notes, tags and an optional mood check-in.
• Export as CSV or JSON, back up and restore, delete a date range or everything.
• Optional fingerprint or face lock around History.

REMINDERS (OPTIONAL)
None by default. Up to eight, each with its own time, weekdays and pattern, with Start, Snooze and Skip today. Android may deliver reminders up to an hour late unless you allow "Alarms & reminders"; the app tells you and links to that setting.

HEALTH CONNECT (OPTIONAL)
If you switch it on in Settings, each saved session of 20 seconds or more is written to Health Connect as a breathing mindfulness session. Write only: Breathe Well never reads your Health Connect data and never uses it for anything else. It is off by default, Android asks for permission at the moment you switch it on, and deleting a session in the app does not remove it from Health Connect. Health Connect is part of Android 14 and newer, and a Google Play app on Android 8 to 13.

PRIVACY
All data stays on your phone. No account, no analytics, no tracking, no ads. The app itself makes no network requests.

IMPORTANT
Breathe Well is for relaxation only. It is a general wellness tool, not a medical device, and does not diagnose, treat, cure or prevent any condition. If you are pregnant or have a heart or lung condition, or a history of fainting, check with a clinician first, skip breath-holds, and stop if you feel dizzy. Do not use it while driving, cycling, swimming or in a bath.

Needs Android 8.0 or newer. The app is in English.

## Privacy

- All data is stored locally (SQLite in the app's private storage). Nothing is uploaded.
- Files leave the phone only when you share or export them yourself.
- Privacy policy: https://plainapps.dfdsfdsfsdf.workers.dev/apps/breathe/privacy

## Build from source

The app identifier `com.tim.breathe` is a placeholder: the identifier changes before the first store release.

You need: **Node.js 22 LTS** (the React Native version used here accepts `^20.19.4 || ^22.13.0 || ^24.3.0`), npm,
and git. The app is an [Expo](https://expo.dev) (SDK 57) / React Native app; the native `android/` and `ios/` folders
are generated from `app.config.ts` and are not in the repository.

```sh
git clone https://github.com/plainappsforever/breathe.git
cd breathe
npm ci
npm run verify          # typecheck + lint + all unit tests
```

### Android (Linux, macOS or Windows)

Needs JDK 17 and the Android SDK (Android Studio installs both; set `ANDROID_HOME`).

```sh
export APP_VARIANT=production
npx expo prebuild --platform android
cd android
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
# APK: android/app/build/outputs/apk/release/ (signed with the debug key unless you configure your own key)
```

`APP_VARIANT` selects the app id and name (`development`, `preview`, `production`; see `app.config.ts`).
Builds made this way are signed with your key, not ours, so they cannot update an installed store version.

### iOS (macOS only)

Needs Xcode (26 or newer) and CocoaPods.

```sh
export APP_VARIANT=production
npx expo prebuild --platform ios
npx expo run:ios --configuration Release        # runs on the iOS Simulator
```

For a real iPhone, open `ios/*.xcworkspace` in Xcode, choose your own team under *Signing & Capabilities*
and change the bundle identifier. There is no sideloading store for iOS; the App Store build is ours.

## Verifying a release

Every GitHub release lists SHA-256 checksums (`SHA256SUMS.txt`) and the APKs are signed with one key per app.
Certificate SHA-256 fingerprint: `not yet published on Android`

## How this app was made

Breathe Well was written with substantial help from an AI coding assistant (Claude Code), directed, reviewed and
tested by the maintainer. We say this openly because some stores and users care about it.

## Licence

Copyright (C) 2026 Farija Retkoceri

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public
License as published by the Free Software Foundation, version 3 (GPL-3.0-only). See [LICENSE](LICENSE).
Third-party components keep their own licences (see `LICENSES/` and the app's licences screen where present).
Contributions: see [CONTRIBUTING.md](CONTRIBUTING.md). Security reports: [SECURITY.md](SECURITY.md).
