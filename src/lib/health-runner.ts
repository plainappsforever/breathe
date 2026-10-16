import type { AppSettings } from '@/db/app-settings';
import type { Db } from '@/db/types';

import { writeMindfulSession } from './health';
import { syncPendingToHealth } from './health-sync';

/**
 * Called after a session is saved and when Home loads: writes what Health has not received yet, but only when
 * the Health toggle is on. Never throws and never waits for the UI.
 */
export function syncSessionsToHealthIfOn(db: Db, settings: Pick<AppSettings, 'healthSync' | 'healthSyncSince'>): void {
  if (!settings.healthSync) return;
  syncPendingToHealth(db, settings.healthSyncSince, writeMindfulSession).catch(() => {});
}
