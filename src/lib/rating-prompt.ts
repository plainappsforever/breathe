import Constants from 'expo-constants';
import Storage from 'expo-sqlite/kv-store';
import * as StoreReview from 'expo-store-review';

import type { Db } from '@/db/types';

/** The store's own rating dialog is asked for after this many completed sessions. */
export const REVIEW_AFTER_SESSIONS = 5;
const ASKED_KEY = 'review-asked-version';

/** Pure rule: enough completed sessions, and not yet asked in this app version. */
export function shouldAskForReview(completedSessions: number, askedVersion: string | null, version: string): boolean {
  return completedSessions >= REVIEW_AFTER_SESSIONS && askedVersion !== version;
}

/**
 * Call from the summary screen only. The "asked" flag lives in expo-sqlite's key-value store, a separate file from the
 * app's database, so it never enters a backup file. The system decides whether the dialog really shows.
 */
export async function maybeAskForReview(db: Db): Promise<boolean> {
  const version = Constants.expoConfig?.version ?? '0';
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM sessions WHERE completed = 1');
  if (!shouldAskForReview(row?.count ?? 0, Storage.getItemSync(ASKED_KEY), version)) return false;
  if (!(await StoreReview.isAvailableAsync())) return false;
  Storage.setItemSync(ASKED_KEY, version);
  await StoreReview.requestReview();
  return true;
}
