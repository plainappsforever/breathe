import * as LocalAuthentication from 'expo-local-authentication';

import type { LockCapability } from './history-lock';

/** Reads what the phone can do. Never prompts. */
export async function getLockCapability(): Promise<LockCapability> {
  try {
    const [hasHardware, level] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.getEnrolledLevelAsync()]);
    return {
      hasHardware,
      level:
        level === LocalAuthentication.SecurityLevel.NONE
          ? 'none'
          : level === LocalAuthentication.SecurityLevel.SECRET
            ? 'secret'
            : 'biometric',
    };
  } catch {
    return { hasHardware: false, level: 'none' };
  }
}

/** Asks the phone to confirm it is the owner (face, fingerprint, or the phone's passcode). True on success. */
export async function confirmOwner(promptMessage: string): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel: 'Cancel', disableDeviceFallback: false });
    return result.success;
  } catch {
    return false;
  }
}
