/* global jest, describe, it, expect */
// with-extension-team: the widget extension target gets the app's Apple team, nothing else changes.
jest.mock('expo/config-plugins', () => ({ withXcodeProject: (config, action) => action(config) }), { virtual: true });
const withExtensionTeam = require('./with-extension-team');

function projectWith(settings) {
  return { modResults: { pbxXCBuildConfigurationSection: () => settings } };
}

describe('with-extension-team', () => {
  it('sets the team on extension configurations only (quoted or unquoted ids)', () => {
    const settings = {
      A: { buildSettings: { PRODUCT_BUNDLE_IDENTIFIER: 'com.example.app' } },
      B: { buildSettings: { PRODUCT_BUNDLE_IDENTIFIER: '"com.example.app.ExpoWidgetsTarget"' } },
      C: { buildSettings: { PRODUCT_BUNDLE_IDENTIFIER: 'com.example.app.ExpoWidgetsTarget' } },
      A_comment: 'text',
    };
    withExtensionTeam(projectWith(settings), { appleTeamId: 'TEAM123456' });
    expect(settings.A.buildSettings.DEVELOPMENT_TEAM).toBeUndefined();
    expect(settings.B.buildSettings.DEVELOPMENT_TEAM).toBe('TEAM123456');
    expect(settings.C.buildSettings.DEVELOPMENT_TEAM).toBe('TEAM123456');
  });

  it('does nothing without a team id', () => {
    const settings = { B: { buildSettings: { PRODUCT_BUNDLE_IDENTIFIER: 'com.example.app.ExpoWidgetsTarget' } } };
    withExtensionTeam(projectWith(settings), {});
    expect(settings.B.buildSettings.DEVELOPMENT_TEAM).toBeUndefined();
  });
});
