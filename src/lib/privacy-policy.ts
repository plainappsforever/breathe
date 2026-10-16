// The privacy policy shown inside the app (v3.1 F2): Settings > Privacy policy, About > Privacy, and the screen
// Health Connect opens from "Read privacy policy" (Android, REVIEW_V3 #2). It must be the same text as the hosted
// page whose address goes into Google Play and App Store Connect (docs/RELEASE_KIT.md section 9a).

/**
 * OWNER: replace with the hosted policy's address (RELEASE_KIT section 9 recommends
 * https://plainapps.dfdsfdsfsdf.workers.dev/apps/breathe/privacy). While it is the placeholder, the app hides the "Read it online" link.
 */
export const PRIVACY_POLICY_URL = 'https://example.com/breathe-well/privacy';
/** OWNER: provider line and date, as on the hosted page (RELEASE_KIT section 9: [DEVELOPER NAME], [POSTAL ADDRESS], [DATE]). */
export const POLICY_PROVIDER = '[DEVELOPER NAME], [POSTAL ADDRESS]';
export const POLICY_DATE = '[DATE]';
export const POLICY_CONTACT = 'plainapps@tuta.com';

/** True while the URL above has not been filled in: the screen then shows the text only. */
export function isPlaceholderPolicyUrl(url: string = PRIVACY_POLICY_URL): boolean {
  return !/^https:\/\//.test(url) || /example\.(com|org|net)/.test(url);
}

/** Rendered in order: paragraphs, bullets, then `after` (so the text reads exactly like the hosted page). */
export type PolicySection = { title: string; paragraphs?: readonly string[]; bullets?: readonly string[]; after?: readonly string[] };

export const POLICY_SECTIONS: readonly PolicySection[] = [
  {
    title: 'In short',
    paragraphs: [
      'The app does not collect, transmit or share personal data. It has no account, no ads, no analytics, no tracking and no third-party code that collects data. The app itself makes no network requests. Everything it stores stays on your phone.',
    ],
  },
  {
    title: 'What the app stores on your phone',
    bullets: [
      'Your sessions: date, time, length, breathing pattern, whether it was completed, and, only if you add them, a note, tags and a mood number before and after.',
      'Your own breathing patterns, favourites, recent patterns and settings (for example guidance strength, volume, colours, reminders).',
      'Your reminders (time, weekdays, pattern) and a record of an unfinished session, so the app can offer to resume it.',
      'A flag per session that it was written to Apple Health or Health Connect, if you turned that on.',
      "For the widget and the Live Activity: today's minutes and the running session, kept in storage that only the app and its widget can read.",
    ],
    after: [
      "This data is kept in the app's private storage on your device. We never receive it. Deleting it in the app (Settings > Export, back up or delete: a date range or everything) or uninstalling the app removes it.",
    ],
  },
  {
    title: 'Apple Health and Health Connect (optional, off by default)',
    paragraphs: [
      'If you turn on "Save sessions to Apple Health" or "Save sessions to Health Connect" in Settings, your phone asks for permission to write. Each saved session of 20 seconds or more is then written as one mindfulness entry: the real start time, end time and, on Android, the title "Breathe Well: <pattern name>". The app never reads any Health or Health Connect data. The data is stored by Apple Health or Health Connect on your phone, under their own rules; it is not sent to us, not shared with anyone, and never used for advertising, marketing or data mining.',
      'You can switch the setting off at any time and change or revoke the permission in the Health app (iPhone: Health > Sharing > Apps) or in Health Connect (Android: Settings > Health Connect > App permissions). Deleting a session in Breathe Well does not delete the entry in Health; you delete it there. Health data you chose to write is not part of the app\'s own backup (the setting is not restored from a backup).',
    ],
  },
  {
    title: 'Permissions the app may ask for, and why',
    paragraphs: ['Each is asked only when you switch on the feature that needs it.'],
    bullets: [
      'Notifications (reminders): to show your reminders. Reminders are scheduled on your phone, not by a server.',
      'Exact alarms / "Alarms & reminders" (Android, optional): so reminders arrive on the minute; without it Android may deliver them up to an hour late.',
      'Face ID or fingerprint (optional History lock): your phone\'s system checks your face or finger; the app only learns "yes" or "no" and never receives biometric data.',
      'Health / Health Connect (optional): see above.',
      'Audio, vibration, wake lock, foreground service (Android) and background audio (iPhone): so the breathing tones and vibration continue on time with the screen locked, only while you have turned on "Keep guiding when locked" and a session is running.',
      'Start on boot (Android): so reminders are set again after a restart.',
    ],
    after: ["The app does not use your location, contacts, photos, camera or microphone, and does not read other apps' data."],
  },
  {
    title: 'Links to studies',
    paragraphs: [
      "The \"About this pattern\" pages contain links to published studies. When you tap one, it opens in your phone's browser (a Chrome Custom Tab or Safari), and that website's own privacy policy applies. The app does not send them anything.",
    ],
  },
  {
    title: 'Files you export',
    paragraphs: [
      'Export and backup create a file only when you ask for it and hand it to the share sheet of your phone. We do not see it. Files you share are in your hands.',
    ],
  },
  {
    title: 'Backups by Apple or Google',
    paragraphs: [
      "Your phone's own device backup (iCloud Backup on iPhone, Android Backup to your Google account) may include the app's stored data if you have that switched on. This is done by Apple or Google under your own account settings; we do not receive or read it. You can turn it off in your phone's settings.",
    ],
  },
  {
    title: 'Sharing, ads, children',
    paragraphs: ['No data is shared with anyone. No ads, no analytics, no account, no purchases. The app is not directed at children.'],
  },
  {
    title: 'Your rights',
    paragraphs: [
      `Since we receive no personal data, there is nothing for us to access, correct or delete; removing the app removes its data from your phone. If you believe we hold data about you, write to ${POLICY_CONTACT}. You may complain to your data protection authority.`,
    ],
  },
  {
    title: 'Medical note',
    paragraphs: ['Breathe Well is a general-wellness relaxation tool, not a medical device. It does not diagnose, treat, cure or prevent any condition.'],
  },
  {
    title: 'Google Play and the App Store',
    paragraphs: [
      'If you install the app through Google Play or the App Store, Google or Apple processes your download under its own privacy policy; we receive only aggregated statistics, not personal data.',
    ],
  },
  {
    title: 'Changes',
    paragraphs: [
      'If this policy changes, the new version is published here and in the app with a new date, and any change in what the app accesses is also named in the update notes.',
    ],
  },
];
