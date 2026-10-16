// v3 P7: native entry points on Android (Quick Settings tile, home-screen widget) open the app's start link,
// `<scheme>://start` (D37). The scheme differs per build variant, so it is written into the manifest as
// application meta-data that the modules read (modules/quick-tile LaunchLink.kt).
const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

const META_SCHEME = 'com.tim.breathe.LAUNCH_SCHEME';

module.exports = function withLaunchScheme(config) {
  return withAndroidManifest(config, (mod) => {
    const scheme = Array.isArray(config.scheme) ? config.scheme[0] : config.scheme;
    if (!scheme) throw new Error('with-launch-scheme: app config has no scheme');
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, META_SCHEME, scheme);
    return mod;
  });
};
