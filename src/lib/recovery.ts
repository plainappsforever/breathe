import type { ActiveSession } from '@/db/active-session';
import { parseTarget, patternFromPhases } from './patterns';
import { cycleMs, sessionEndMs } from './session-schedule';

/** An unattended Open session older than this is not offered for resume (its real end is unknown). */
export const MAX_RESUME_OPEN_MS = 2 * 60 * 60 * 1000;
/** A paused session left alone this long is saved as a partial session instead of offered again. */
export const MAX_PAUSED_MS = 24 * 60 * 60 * 1000;
/** How often a running session writes how far it has really guided (Home, on phase starts and on leaving). */
export const GUIDED_HEARTBEAT_MS = 5_000;

export type RecoveryOutcome =
  /** Continue from where the guidance stopped (never from where the clock would be by now: that time was not guided). */
  | { status: 'resume'; elapsedMs: number }
  /**
   * Save it to History: completed only if the guidance itself reached the planned end; otherwise partial, at the
   * time really guided, and `interrupted` (the app saved it, the user did not end it). REVIEW_V3 #3, WORKFLOW L26.
   */
  | { status: 'finished'; actualSeconds: number; breaths: number; completed: boolean; interrupted: boolean }
  /** Nothing trustworthy to save or resume: just clear the record. */
  | { status: 'discard' };

/**
 * Session time known to have been guided: the paused time, or the last progress the running app confirmed
 * (`guidedMs`, at most every GUIDED_HEARTBEAT_MS, so it can be up to that much short: never more than real).
 * A record written before v3.1 has no confirmation and counts as 0.
 */
export function guidedElapsedMs(active: ActiveSession, now: number): number {
  if (active.pausedElapsedMs !== null) return Math.max(0, active.pausedElapsedMs);
  const wallMs = Math.max(0, now - active.startTime);
  return Math.min(wallMs, Math.max(0, active.guidedMs ?? 0));
}

/** The record saved as it stands: completed only if the guided time reached the planned end. */
export function savedOutcome(active: ActiveSession, now: number): RecoveryOutcome {
  const target = parseTarget(active.target);
  if (!target || active.phases.length === 0) return { status: 'discard' };
  const pattern = patternFromPhases(active.patternId, active.patternName, active.phases);
  const cycle = cycleMs(pattern);
  const endMs = sessionEndMs(pattern, target);
  const guided = guidedElapsedMs(active, now);
  if (endMs !== null && guided >= endMs) {
    return { status: 'finished', actualSeconds: endMs / 1000, breaths: Math.round(endMs / cycle), completed: true, interrupted: false };
  }
  return { status: 'finished', actualSeconds: guided / 1000, breaths: Math.floor(guided / cycle), completed: false, interrupted: true };
}

/**
 * Decides what to do with a session record found at launch. Pure: `now` is passed in.
 * - paused: offer to resume at the paused time; after a day, save it as partial at that time;
 * - running and still inside its planned length (wall clock), or an Open one under 2 h: offer to resume from where
 *   the guidance stopped;
 * - otherwise: save only the guided time (partial, interrupted), or completed if the guidance really reached the end.
 * Never saves time nobody was guided through as session time (v3.1 F3; D36 saved the full planned length).
 */
export function evaluateActiveSession(active: ActiveSession, now: number): RecoveryOutcome {
  const target = parseTarget(active.target);
  if (!target || active.phases.length === 0) return { status: 'discard' };
  const pattern = patternFromPhases(active.patternId, active.patternName, active.phases);
  const endMs = sessionEndMs(pattern, target);
  const guided = guidedElapsedMs(active, now);
  if (endMs !== null && guided >= endMs) return savedOutcome(active, now);

  if (active.pausedElapsedMs !== null) {
    if (now - (active.pausedAt ?? now) > MAX_PAUSED_MS) return savedOutcome(active, now);
    return { status: 'resume', elapsedMs: guided };
  }
  const wallMs = Math.max(0, now - active.startTime);
  if (wallMs < (target.kind === 'open' ? MAX_RESUME_OPEN_MS : (endMs ?? MAX_RESUME_OPEN_MS))) return { status: 'resume', elapsedMs: guided };
  return savedOutcome(active, now);
}
