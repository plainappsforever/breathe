import { Platform } from 'react-native';

/**
 * Apple Health (HealthKit) and Health Connect, write-only (V3 P6, D51): one mindful session per saved
 * session, type breathing on Android, Mindful Minutes on iOS. Nothing is ever read. Each native library is
 * required lazily, only on its own platform, so a build without one still runs and simply reports
 * "not available". Nothing here asks for a permission except `requestHealthPermission`, which the Health
 * toggle calls at the moment it is turned on.
 */
export type HealthResult = { ok: true } | { ok: false; message: string };

const MINDFUL_TYPE = 'HKCategoryTypeIdentifierMindfulSession' as const;
/** react-native-health-connect: SdkAvailabilityStatus.SDK_AVAILABLE / ...PROVIDER_UPDATE_REQUIRED, MindfulnessSessionType.BREATHING. */
const HC_AVAILABLE = 3;
const HC_UPDATE_REQUIRED = 2;
const HC_BREATHING = 2;

/* eslint-disable @typescript-eslint/no-require-imports */
const healthKit = () => require('@kingstinct/react-native-healthkit') as typeof import('@kingstinct/react-native-healthkit');
const healthConnect = () => require('react-native-health-connect') as typeof import('react-native-health-connect');
/* eslint-enable @typescript-eslint/no-require-imports */

export function healthAppName(): string {
  return Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect';
}

/** Can this phone take Health writes at all? Never prompts. */
export async function healthAvailability(): Promise<HealthResult> {
  try {
    if (Platform.OS === 'ios') {
      const ok = await healthKit().isHealthDataAvailableAsync();
      return ok ? { ok: true } : { ok: false, message: 'Apple Health is not available on this device.' };
    }
    if (Platform.OS === 'android') {
      const status = await healthConnect().getSdkStatus();
      if (status === HC_AVAILABLE) return { ok: true };
      if (status === HC_UPDATE_REQUIRED) {
        return { ok: false, message: 'Health Connect needs an update from Google Play before Breathe Well can save sessions to it.' };
      }
      return { ok: false, message: 'Health Connect is not installed or not available on this phone.' };
    }
  } catch {
    // fall through: the library is missing from this build or failed to start
  }
  return { ok: false, message: 'Saving to Health is not available in this build.' };
}

/** Shows the system permission sheet (write access to mindful sessions only). */
export async function requestHealthPermission(): Promise<HealthResult> {
  try {
    if (Platform.OS === 'ios') {
      const hk = healthKit();
      await hk.requestAuthorization({ toShare: [MINDFUL_TYPE] });
      // For writing, the answer is only visible through the sharing status (2 = allowed).
      const status = hk.authorizationStatusFor(MINDFUL_TYPE);
      return Number(status) === 2
        ? { ok: true }
        : { ok: false, message: 'Not allowed. To change it: Settings, Health, Data Access & Devices, Breathe Well.' };
    }
    if (Platform.OS === 'android') {
      const hc = healthConnect();
      if (!(await hc.initialize())) return { ok: false, message: 'Health Connect could not be started.' };
      const granted = await hc.requestPermission([{ accessType: 'write', recordType: 'MindfulnessSession' }]);
      const allowed = granted.some((p) => 'recordType' in p && p.recordType === 'MindfulnessSession' && p.accessType === 'write');
      return allowed ? { ok: true } : { ok: false, message: 'Not allowed. You can allow it in Health Connect, App permissions, Breathe Well.' };
    }
  } catch {
    // fall through
  }
  return { ok: false, message: `${healthAppName()} did not accept the request.` };
}

/** Writes one mindful session. Returns false (never throws) when Health refuses, e.g. permission was withdrawn. */
export async function writeMindfulSession(startMs: number, endMs: number, title: string): Promise<boolean> {
  try {
    if (Platform.OS === 'ios') {
      // value 0 = HKCategoryValue.notApplicable
      await healthKit().saveCategorySample(MINDFUL_TYPE, 0, new Date(startMs), new Date(endMs));
      return true;
    }
    if (Platform.OS === 'android') {
      const hc = healthConnect();
      await hc.initialize();
      await hc.insertRecords([
        {
          recordType: 'MindfulnessSession',
          startTime: new Date(startMs).toISOString(),
          endTime: new Date(endMs).toISOString(),
          mindfulnessSessionType: HC_BREATHING,
          title,
        },
      ]);
      return true;
    }
  } catch {
    // permission withdrawn, Health Connect busy: the session stays unsynced and is tried again later
  }
  return false;
}
