/**
 * v3 P7: what the native entry points outside the app show. Pure builders only (Jest-tested); the glue that
 * hands the result to the phone lives in `quick-actions.ts`. Every entry point starts a session through one
 * launch URL, parsed by `launch-intent.ts` (D37).
 */
import { buildLaunchUrl } from './launch-intent';
import { targetLabel, type SessionTarget } from './patterns';

export type QuickActionItem = {
  id: string;
  title: string;
  /** iOS shows it under the title; Android launchers do not. */
  subtitle: string;
  /** iOS SF Symbol; Android shortcuts use the app icon. */
  iosIcon: string;
  url: string;
};

export type PatternChoice = { id: string; name: string; target: SessionTarget };

export const BREATHE_NOW_ID = 'breathe-now';

/**
 * Launcher quick actions: "Breathe now" (the user's default: last used pattern and length) and the two most
 * recently used patterns that are not that default (each with its own remembered length, resolved at start).
 */
export function buildQuickActions(scheme: string, fallback: PatternChoice, recent: readonly PatternChoice[]): QuickActionItem[] {
  const items: QuickActionItem[] = [
    {
      id: BREATHE_NOW_ID,
      title: 'Breathe now',
      subtitle: `${fallback.name} · ${targetLabel(fallback.target)}`,
      iosIcon: 'symbol:wind',
      url: buildLaunchUrl(scheme, {}),
    },
  ];
  const seen = new Set([fallback.id]);
  for (const choice of recent) {
    if (items.length >= 3) break;
    if (seen.has(choice.id)) continue;
    seen.add(choice.id);
    items.push({
      id: `pattern-${choice.id}`,
      title: choice.name,
      subtitle: targetLabel(choice.target),
      iosIcon: 'symbol:clock.arrow.circlepath',
      url: buildLaunchUrl(scheme, { patternId: choice.id }),
    });
  }
  return items;
}

/** "Minutes today" on the widgets: whole minutes, at least 1 once any session was saved today. */
export function todayMinutes(totalSeconds: number, sessions: number): number {
  if (sessions <= 0 || totalSeconds <= 0) return 0;
  return Math.max(1, Math.round(totalSeconds / 60));
}

export type StartWidgetProps = { minutes: number; url: string };

/** iOS widget timeline: today's number now, 0 from the next local midnight (the widget needs no app then). */
export function startWidgetTimeline(minutes: number, url: string, now: number): { date: number; props: StartWidgetProps }[] {
  const d = new Date(now);
  const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  return [
    { date: now, props: { minutes, url } },
    { date: midnight, props: { minutes: 0, url } },
  ];
}

export type SessionActivityProps = {
  title: string;
  /** Second line: the target ("3 min", "20 breaths", "Open") or "Paused". */
  subtitle: string;
  /** Timer range (ms): counts down to endAt, or up from startAt for Open. */
  startAt: number;
  endAt: number;
  countsDown: boolean;
  paused: boolean;
  /** Clock shown while paused (the timer stops), e.g. "2:13". */
  pausedClock: string;
};

export type RunningSession = {
  patternName: string;
  target: SessionTarget;
  /** Engine clock origin (wall clock minus elapsed), as in the recovery record. */
  startTime: number;
  /** Countdown end in session ms (the engine's displayEnd); null for Open. */
  displayEndMs: number | null;
  /** Elapsed ms at the pause; null while running. */
  pausedElapsedMs: number | null;
};

export type LiveActivityPlan = { action: 'end' } | { action: 'show'; props: SessionActivityProps; staleAt: number | null };

const OPEN_RANGE_MS = 8 * 60 * 60 * 1000;

/** What the Live Activity shows for a session (or that it should end). Pure; `ios-surfaces.ts` applies it. */
export function liveActivityPlan(enabled: boolean, session: RunningSession | null): LiveActivityPlan {
  if (!enabled || !session) return { action: 'end' };
  const countsDown = session.displayEndMs != null;
  const endAt = countsDown ? session.startTime + session.displayEndMs! : session.startTime + OPEN_RANGE_MS;
  const paused = session.pausedElapsedMs != null;
  const shownMs = paused
    ? countsDown
      ? Math.max(0, session.displayEndMs! - session.pausedElapsedMs!)
      : session.pausedElapsedMs!
    : 0;
  return {
    action: 'show',
    props: {
      title: session.patternName,
      subtitle: paused ? 'Paused' : targetLabel(session.target),
      startAt: session.startTime,
      endAt,
      countsDown,
      paused,
      pausedClock: paused ? formatClockMs(shownMs) : '',
    },
    // A countdown that passed without the app ending the activity is stale (the app was killed).
    staleAt: countsDown && !paused ? endAt + 60_000 : null,
  };
}

function formatClockMs(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Links shown in About > "Start from a shortcut" (Shortcuts app "Open URLs", Action Button, automation apps). */
export const SHORTCUT_EXAMPLES: readonly { id: string; label: string; params: { patternId?: string; target?: string } }[] = [
  { id: 'default', label: 'Your usual session', params: {} },
  { id: 'box-5', label: 'Box, 5 minutes', params: { patternId: 'box', target: 'm:5' } },
  { id: 'slow-20', label: 'Slow, 20 breaths', params: { patternId: 'slow', target: 'b:20' } },
];
