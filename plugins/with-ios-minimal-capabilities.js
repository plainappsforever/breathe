// V3 P6: keep the iOS capabilities honest. This app schedules local reminders and writes Mindful Minutes;
// it does not use push, background fetch or reading Health. Three libraries add these anyway:
//  - @kingstinct/react-native-healthkit adds NSHealthShareUsageDescription ("wants to read your health data"), replaced below by a text that says the app does not read;
//  - expo-notifications adds the aps-environment (push) entitlement;
//  - expo-task-manager adds the "fetch" background mode (its Android-only use here needs neither).
// Registered FIRST in app.config.ts because config-plugin mods run in reverse order (this one runs last).
const { withEntitlementsPlist, withInfoPlist } = require('expo/config-plugins');

module.exports = function withIosMinimalCapabilities(config) {
  config = withInfoPlist(config, (mod) => {
    // Store build (2026-11-07): App Store Connect refuses the upload without a NSHealthShareUsageDescription whenever the
    // binary links the HealthKit library (it references the read APIs), even though the app never reads. So the key is
    // replaced by a truthful text instead of being deleted. The iOS permission sheet never shows it: the app only requests
    // write access (Mindful Minutes).
    mod.modResults.NSHealthShareUsageDescription =
      'Breathe Well does not read your Health data. It only saves your breathing sessions as Mindful Minutes.';
    const modes = mod.modResults.UIBackgroundModes;
    if (Array.isArray(modes)) mod.modResults.UIBackgroundModes = modes.filter((m) => m !== 'fetch');
    // v3.1: release builds (preview, production) must not carry the Expo dev launcher's local-network keys. Its own
    // "strip for Release" build phase did not remove them from the preview app (read with plutil, 2026-10-01): the
    // Release Info.plist said "Expo Dev Launcher uses the local network ...". Development keeps them (Metro discovery).
    if (process.env.APP_VARIANT && process.env.APP_VARIANT !== 'development') {
      const bonjour = mod.modResults.NSBonjourServices;
      if (Array.isArray(bonjour)) {
        const kept = bonjour.filter((s) => s !== '_expo._tcp');
        if (kept.length > 0) mod.modResults.NSBonjourServices = kept;
        else delete mod.modResults.NSBonjourServices;
      }
      if (String(mod.modResults.NSLocalNetworkUsageDescription ?? '').startsWith('Expo Dev Launcher')) {
        delete mod.modResults.NSLocalNetworkUsageDescription;
      }
    }
    return mod;
  });
  return withEntitlementsPlist(config, (mod) => {
    delete mod.modResults['aps-environment'];
    return mod;
  });
};
