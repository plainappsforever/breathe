// V3 P6: keep the iOS capabilities honest. This app schedules local reminders and writes Mindful Minutes;
// it does not use push, background fetch or reading Health. Three libraries add these anyway:
//  - @kingstinct/react-native-healthkit adds NSHealthShareUsageDescription ("wants to read your health data");
//  - expo-notifications adds the aps-environment (push) entitlement;
//  - expo-task-manager adds the "fetch" background mode (its Android-only use here needs neither).
// Registered FIRST in app.config.ts because config-plugin mods run in reverse order (this one runs last).
const { withEntitlementsPlist, withInfoPlist } = require('expo/config-plugins');

module.exports = function withIosMinimalCapabilities(config) {
  config = withInfoPlist(config, (mod) => {
    delete mod.modResults.NSHealthShareUsageDescription;
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
