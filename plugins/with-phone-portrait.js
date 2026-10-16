// V3 P3: phones stay portrait, tablets and unfolded foldables (smallest width >= 600 dp) may rotate.
// Android's manifest cannot say "portrait on phones only", so app.config.ts leaves the orientation
// unspecified and this plugin locks phones in MainActivity.onCreate. (iOS: see ios.infoPlist in app.config.ts.)
const { withMainActivity } = require('expo/config-plugins');

const MARKER = 'breathe-phone-portrait';
const SNIPPET = `    // ${MARKER}: phones stay portrait; tablets and unfolded foldables may rotate.
    if (resources.configuration.smallestScreenWidthDp < 600) {
      requestedOrientation = android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
    }
`;

module.exports = function withPhonePortrait(config) {
  return withMainActivity(config, (mod) => {
    if (mod.modResults.language !== 'kt') throw new Error('with-phone-portrait expects a Kotlin MainActivity');
    const contents = mod.modResults.contents;
    if (!contents.includes(MARKER)) {
      if (!contents.includes('super.onCreate(null)')) throw new Error('with-phone-portrait: super.onCreate(null) not found');
      mod.modResults.contents = contents.replace('    super.onCreate(null)', `${SNIPPET}    super.onCreate(null)`);
    }
    return mod;
  });
};
