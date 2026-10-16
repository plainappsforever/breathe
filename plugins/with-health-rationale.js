// v3.1 F2 (REVIEW_V3 #2, RELEASE_KIT 4c): Health Connect's "Read privacy policy" link (Android 13 and lower:
// action androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE) and Settings > Permission usage (Android 14+: the
// ViewPermissionUsageActivity alias, VIEW_PERMISSION_USAGE + HEALTH_PERMISSIONS) must show the app's privacy
// policy. The react-native-health-connect plugin points both at MainActivity, which just opened Home. This plugin
// moves both to PrivacyLinkActivity (modules/quick-tile), which opens `<scheme>://privacy`, the in-app policy
// screen (src/app/privacy.tsx). Listed near the top of app.config.ts plugins so its mod runs after the library's.
const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

const RATIONALE_ACTION = 'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE';
const ALIAS = 'ViewPermissionUsageActivity';
const ACTIVITY = 'expo.modules.quicktile.PrivacyLinkActivity';

const hasAction = (filter, name) => (filter.action ?? []).some((a) => a.$['android:name'] === name);

module.exports = function withHealthRationale(config) {
  return withAndroidManifest(config, (mod) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    const main = AndroidConfig.Manifest.getMainActivityOrThrow(mod.modResults);
    main['intent-filter'] = (main['intent-filter'] ?? []).filter((f) => !hasAction(f, RATIONALE_ACTION));

    app.activity = (app.activity ?? []).filter((a) => a.$['android:name'] !== ACTIVITY);
    app.activity.push({
      $: {
        'android:name': ACTIVITY,
        'android:exported': 'true',
        'android:excludeFromRecents': 'true',
        'android:noHistory': 'true',
        'android:theme': '@android:style/Theme.Translucent.NoTitleBar',
      },
      'intent-filter': [{ action: [{ $: { 'android:name': RATIONALE_ACTION } }] }],
    });

    const alias = (app['activity-alias'] ?? []).find((a) => a.$['android:name'] === ALIAS);
    if (alias) alias.$['android:targetActivity'] = ACTIVITY;
    return mod;
  });
};
