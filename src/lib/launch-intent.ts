import { parseTarget, type SessionTarget } from './patterns';

/**
 * One parser for every way of starting a session from outside the app: deep links, and later quick
 * actions, widgets, the Quick Settings tile, reminder actions, Shortcuts and NFC tags all build or
 * receive the same URL: `breathe://start?pattern=<id>&target=m:3` (the scheme differs per build
 * variant: breathe, breathe-preview, breathe-dev). `start` alone means "the user's default session".
 */
export type LaunchIntent = {
  action: 'start';
  /** Preset id or custom pattern id; unknown ids are resolved to the default by the session screen. */
  patternId?: string;
  target?: SessionTarget;
};

export const APP_SCHEMES: readonly string[] = ['breathe', 'breathe-preview', 'breathe-dev'];

const PATTERN_ID = /^[A-Za-z0-9_.-]{1,64}$/;

/** Builds an intent from raw `pattern` / `target` strings (URL query or router params). Bad values are dropped. */
export function intentFromParams(params: { pattern?: string | string[]; target?: string | string[] }): LaunchIntent {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const pattern = first(params.pattern);
  const target = parseTarget(first(params.target));
  const intent: LaunchIntent = { action: 'start' };
  if (pattern && PATTERN_ID.test(pattern)) intent.patternId = pattern;
  if (target) intent.target = target;
  return intent;
}

function parseQuery(query: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const [rawKey, ...rest] = pair.split('=');
    try {
      out[decodeURIComponent(rawKey)] = decodeURIComponent(rest.join('=').replace(/\+/g, ' '));
    } catch {
      // ignore an undecodable pair
    }
  }
  return out;
}

/** Parses a launch URL. Returns null for anything that is not an app "start" link. */
export function parseLaunchUrl(url: string): LaunchIntent | null {
  const match = /^([a-z][a-z0-9+.-]*):\/\/\/?(?:--\/)?([^?#]*)(?:\?([^#]*))?/i.exec(url.trim());
  if (!match) return null;
  const [, scheme, path, query] = match;
  if (!APP_SCHEMES.includes(scheme.toLowerCase())) return null;
  if (path.replace(/\/+$/, '').toLowerCase() !== 'start') return null;
  return intentFromParams(parseQuery(query ?? ''));
}

export function buildLaunchUrl(scheme: string, intent: { patternId?: string; target?: string }): string {
  const query: string[] = [];
  if (intent.patternId) query.push(`pattern=${encodeURIComponent(intent.patternId)}`);
  // ':' stays readable (target=m:5, the documented form people type into Shortcuts); it is legal in a query.
  if (intent.target) query.push(`target=${encodeURIComponent(intent.target).replace(/%3A/gi, ':')}`);
  return `${scheme}://start${query.length ? `?${query.join('&')}` : ''}`;
}

// The route that receives a deep link stores the intent here; the session screen consumes it once.
let pending: LaunchIntent | null = null;

export function setPendingIntent(intent: LaunchIntent | null): void {
  pending = intent;
}

/** Returns the waiting intent (if any) and clears it, so an intent starts at most one session. */
export function consumePendingIntent(): LaunchIntent | null {
  const intent = pending;
  pending = null;
  return intent;
}
