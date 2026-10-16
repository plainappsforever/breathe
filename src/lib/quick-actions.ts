/**
 * v3 P7.1: launcher quick actions (long-press the app icon) through expo-quick-actions. The items are built
 * by `buildQuickActions` (pure); each carries a launch URL in `params.url`, which the root layout turns into
 * a session through the launch-intent route. Never throws: a launcher problem must not touch Home.
 */
import * as QuickActions from 'expo-quick-actions';
import { Platform } from 'react-native';

import { resolvePatternById } from '@/db/custom-patterns';
import { getPatternPrefs, listRecentPatternIds } from '@/db/pattern-prefs';
import type { Db } from '@/db/types';

import { appScheme } from './app-scheme';
import { buildQuickActions, type PatternChoice } from './entry-points';
import { parseLaunchUrl, type LaunchIntent } from './launch-intent';
import type { SessionTarget } from './patterns';

let lastPublished = '';

/** Publishes "Breathe now" + two recent patterns. Skips the native call when nothing changed. */
export async function refreshQuickActions(db: Db, defaultPatternId: string, defaultTarget: SessionTarget): Promise<void> {
  try {
    const choice = async (id: string, fallbackTarget: SessionTarget): Promise<PatternChoice> => {
      const pattern = await resolvePatternById(db, id);
      const prefs = await getPatternPrefs(db, pattern.id);
      return { id: pattern.id, name: pattern.name, target: prefs?.target ?? fallbackTarget };
    };
    const fallback = { ...(await choice(defaultPatternId, defaultTarget)), target: defaultTarget };
    const recent: PatternChoice[] = [];
    for (const id of await listRecentPatternIds(db, 3)) recent.push(await choice(id, defaultTarget));
    const items = buildQuickActions(appScheme(), fallback, recent).map((item) => ({
      id: item.id,
      title: item.title,
      subtitle: item.subtitle,
      icon: Platform.OS === 'ios' ? item.iosIcon : null,
      params: { url: item.url },
    }));
    const key = JSON.stringify(items);
    if (key === lastPublished) return;
    await QuickActions.setItems(items);
    lastPublished = key;
  } catch (e) {
    if (__DEV__) console.warn('[quick-actions]', e);
  }
}

/** The launch intent a quick action carries, or null for anything else. */
export function intentFromQuickAction(action: QuickActions.Action | undefined | null): LaunchIntent | null {
  const url = action?.params?.url;
  return typeof url === 'string' ? parseLaunchUrl(url) : null;
}

let initialHandled = false;

/** The action that cold-started the app, once per process. */
export function takeInitialQuickAction(): QuickActions.Action | undefined {
  if (initialHandled) return undefined;
  initialHandled = true;
  return QuickActions.initial;
}

export const addQuickActionListener = QuickActions.addListener;
