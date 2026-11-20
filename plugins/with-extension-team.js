// Store builds: expo only writes DEVELOPMENT_TEAM on the app target, so an archive fails with "Signing for <extension>
// requires a development team" (safe-share store build part B, 2026-11-07). This gives the widget extension target the
// same team (APPLE_TEAM_ID). Must stay ABOVE expo-widgets in app.config.ts (Xcode-project mods run in reverse order,
// so the extension target exists when this one runs).
const { withXcodeProject } = require('expo/config-plugins');

module.exports = function withExtensionTeam(config, { appleTeamId, targetName = 'ExpoWidgetsTarget' } = {}) {
  return withXcodeProject(config, (mod) => {
    if (!appleTeamId) return mod;
    const configs = mod.modResults.pbxXCBuildConfigurationSection();
    for (const entry of Object.values(configs)) {
      if (typeof entry !== 'object' || !entry.buildSettings) continue;
      const bundleId = String(entry.buildSettings.PRODUCT_BUNDLE_IDENTIFIER ?? '').replace(/"/g, '');
      if (bundleId.endsWith('.' + targetName)) entry.buildSettings.DEVELOPMENT_TEAM = appleTeamId;
    }
    return mod;
  });
};
