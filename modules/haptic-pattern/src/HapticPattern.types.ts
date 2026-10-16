export type HapticCueKind = 'inhale' | 'exhale' | 'sip' | 'holdStart' | 'holdEnd' | 'end';
/** 0.1 (barely there) to 1.0 (full). The v1 words are still accepted: 'gentle' = 0.45, 'strong' = 0.9. */
export type HapticStrength = number | 'gentle' | 'strong';
export type HapticCapabilities = { ramps: boolean };

/** The number the native side receives, always within 0.1-1.0. */
export function resolveStrength(strength: HapticStrength): number {
  const value = strength === 'gentle' ? 0.45 : strength === 'strong' ? 0.9 : strength;
  return Number.isFinite(value) ? Math.min(1, Math.max(0.1, value)) : 0.45;
}
