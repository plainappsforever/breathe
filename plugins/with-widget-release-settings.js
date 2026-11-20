// P8 (A18): expo-widgets 57.0.27 writes the SAME build settings into the Debug and the Release configuration of its
// extension target (plugin/build/ios/xcode/addXCConfigurationList.js): SWIFT_OPTIMIZATION_LEVEL "-Onone" in Release too,
// so Xcode also builds the SwiftUI-preview debug dylib (ENABLE_DEBUG_DYLIB = YES): the preview Release build carried
// ExpoWidgetsTarget.debug.dylib (16.7 MB) and __preview.dylib inside the .appex, with unoptimised Swift. Its
// TARGETED_DEVICE_FAMILY "1,2" also differs from the iPhone-only app ("1").
// This plugin gives the extension's RELEASE configuration release settings (-O, no debug dylib, the app's device family);
// Debug stays as expo-widgets writes it. Registered BEFORE expo-widgets in app.config.ts, so this Xcode mod runs after
// the one that adds the target (mods run last-registered-first).
const { withXcodeProject } = require('expo/config-plugins');

const RELEASE_SETTINGS = {
  SWIFT_OPTIMIZATION_LEVEL: '"-O"',
  ENABLE_DEBUG_DYLIB: 'NO',
  TARGETED_DEVICE_FAMILY: '1',
};

function applyReleaseSettings(project, targetName) {
  const target = project.pbxTargetByName(targetName);
  if (!target) return 0;
  const list = project.pbxXCConfigurationList()[target.buildConfigurationList];
  const configs = project.pbxXCBuildConfigurationSection();
  let changed = 0;
  for (const ref of list?.buildConfigurations ?? []) {
    const entry = configs[ref.value];
    if (entry?.name !== 'Release') continue;
    Object.assign(entry.buildSettings, RELEASE_SETTINGS);
    changed += 1;
  }
  return changed;
}

module.exports = function withWidgetReleaseSettings(config, { targetName = 'ExpoWidgetsTarget' } = {}) {
  return withXcodeProject(config, (mod) => {
    applyReleaseSettings(mod.modResults, targetName);
    return mod;
  });
};
module.exports.applyReleaseSettings = applyReleaseSettings;
module.exports.RELEASE_SETTINGS = RELEASE_SETTINGS;
