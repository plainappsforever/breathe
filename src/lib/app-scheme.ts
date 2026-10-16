import Constants from 'expo-constants';

/** This build's URL scheme (breathe, breathe-preview or breathe-dev), for launch URLs made inside the app. */
export function appScheme(): string {
  const s = Constants.expoConfig?.scheme;
  return (Array.isArray(s) ? s[0] : s) ?? 'breathe';
}
