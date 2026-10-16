// The optional History lock (V3 P5). Pure decisions; `local-auth.ts` talks to the phone.
//
// The lock guards the History screen, the session details and the export/backup screen. It never touches the
// session screen (one tap to breathing stays one tap).

/** What the phone can do, as reported by expo-local-authentication. */
export type LockCapability = {
  hasHardware: boolean;
  /** 'none' = no Face ID / fingerprint / passcode set up; 'secret' = passcode or PIN only; 'biometric' = a face or finger. */
  level: 'none' | 'secret' | 'biometric';
};

/** True when the phone can actually ask (biometrics, or at least a passcode as the fallback). */
export function canUseLock(capability: LockCapability): boolean {
  return capability.level !== 'none' && (capability.hasHardware || capability.level === 'secret');
}

export type GateState = 'open' | 'locked';

/**
 * Whether History shows straight away. A lock that the phone can no longer ask for (Face ID and passcode were
 * removed after switching it on) must never lock the owner out of their own history, so it stays open.
 */
export function initialGateState(enabled: boolean, capability: LockCapability): GateState {
  return enabled && canUseLock(capability) ? 'locked' : 'open';
}

/** Why the switch cannot be turned on yet, in plain words; null when it can. */
export function lockUnavailableReason(capability: LockCapability): string | null {
  if (canUseLock(capability)) return null;
  return capability.hasHardware
    ? 'Set up Face ID, a fingerprint or a screen lock in your phone settings first.'
    : 'This phone has no Face ID, fingerprint or screen lock to use.';
}

/**
 * The app's own file picker and share sheet send the app to the background on Android. Leaving for them must not
 * re-lock History: the Data screen would unmount and lose the chosen backup and its "Restore N sessions?" question
 * (REVIEW_V3 #10). Held only while that system screen is open, and never longer than LOCK_HOLD_MAX_MS.
 */
export const LOCK_HOLD_MAX_MS = 10 * 60_000;
let lockHeldUntil = 0;

export function lockHeldOpen(now: number = Date.now()): boolean {
  return now < lockHeldUntil;
}

/** Runs a system picker or share sheet without re-locking History when the app goes to the background for it. */
export async function withLockHeldOpen<T>(open: () => Promise<T>, now: () => number = Date.now): Promise<T> {
  lockHeldUntil = now() + LOCK_HOLD_MAX_MS;
  try {
    return await open();
  } finally {
    lockHeldUntil = 0;
  }
}
