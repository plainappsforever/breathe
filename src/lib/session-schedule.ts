import type { Pattern, PhaseKind, SessionTarget } from './patterns';

/**
 * Pure schedule math shared by the JS engine and (from P2) the Android native scheduler, so there is
 * one source of truth for when each cue happens (DECISIONS D12). All offsets are milliseconds since
 * session start, excluding paused time.
 */

export type ScheduledCue = {
  /** Offset since session START (not since fromMs) at which the cue fires. */
  atMs: number;
  kind: PhaseKind | 'end';
  /** Length of the phase this cue starts; 0 for the end cue. */
  durationMs: number;
};

/** Cue lists for Open sessions are capped at this horizon unless the caller asks for another. */
export const DEFAULT_OPEN_HORIZON_MS = 60 * 60 * 1000;

export function cycleMs(pattern: Pattern): number {
  return pattern.phases.reduce((sum, p) => sum + p.seconds * 1000, 0);
}

/**
 * Offset at which the session ends: always a breath boundary. Minutes targets round the length up to
 * the next boundary (a 3-minute Box session ends at 3:12, never mid-breath); breath targets are exact;
 * Open has no planned end (null).
 */
export function targetEndMs(pattern: Pattern, target: SessionTarget): number | null {
  const cycle = cycleMs(pattern);
  if (target.kind === 'open' || cycle <= 0) return null;
  if (target.kind === 'breaths') return target.value * cycle;
  return Math.ceil((target.value * 60_000) / cycle) * cycle;
}

/** Open sessions end by themselves after this long, at the next breath boundary (v3.1 F4, REVIEW_V3 #8). */
export const OPEN_MAX_MS = 2 * 60 * 60 * 1000;

/**
 * Where a session really stops: the target's end, or for Open the first breath boundary at or after
 * OPEN_MAX_MS. An Open session left running (asleep, forgotten) ends with the end cue instead of going
 * silent after the cue list ran out while the notification, wake lock and clock went on.
 */
export function sessionEndMs(pattern: Pattern, target: SessionTarget): number | null {
  const end = targetEndMs(pattern, target);
  if (end !== null || target.kind !== 'open') return end;
  const cycle = cycleMs(pattern);
  return cycle > 0 ? Math.ceil(OPEN_MAX_MS / cycle) * cycle : null;
}

/** The nominal length shown as a countdown: minutes as chosen, breaths exact, Open none. */
export function targetDisplayMs(pattern: Pattern, target: SessionTarget): number | null {
  if (target.kind === 'minutes') return target.value * 60_000;
  return targetEndMs(pattern, target);
}

/** Planned length in seconds for the history record; null for Open. */
export function targetPlannedSeconds(pattern: Pattern, target: SessionTarget): number | null {
  if (target.kind === 'minutes') return target.value * 60;
  const end = targetEndMs(pattern, target);
  return end == null ? null : end / 1000;
}

export type SchedulePosition = {
  phaseIndex: number;
  /** 0-based count of full breaths completed before this phase. */
  breathIndex: number;
  /** Offset at which the phase containing offsetMs began. */
  phaseStartOffsetMs: number;
};

/** Which phase is running at a given offset (a boundary belongs to the phase that starts there). */
export function locate(pattern: Pattern, offsetMs: number): SchedulePosition {
  const cycle = cycleMs(pattern);
  const offset = Math.max(0, offsetMs);
  const breathIndex = Math.floor(offset / cycle);
  let phaseStart = breathIndex * cycle;
  for (let i = 0; i < pattern.phases.length; i++) {
    const length = pattern.phases[i].seconds * 1000;
    if (offset < phaseStart + length) return { phaseIndex: i, breathIndex, phaseStartOffsetMs: phaseStart };
    phaseStart += length;
  }
  // Floating-point safety net: treat as the start of the next breath.
  return { phaseIndex: 0, breathIndex: breathIndex + 1, phaseStartOffsetMs: (breathIndex + 1) * cycle };
}

/**
 * Every cue from fromMs on (a cue at exactly fromMs is included), ending with an 'end' cue at the
 * target's end offset. Open sessions have no end cue and stop at fromMs + horizonMs.
 */
export function buildSchedule(
  pattern: Pattern,
  target: SessionTarget,
  fromMs = 0,
  options: { horizonMs?: number } = {}
): ScheduledCue[] {
  const cycle = cycleMs(pattern);
  if (cycle <= 0) return [];
  const endMs = targetEndMs(pattern, target);
  const limit = endMs ?? fromMs + (options.horizonMs ?? DEFAULT_OPEN_HORIZON_MS);
  const cues: ScheduledCue[] = [];
  let breath = Math.floor(Math.max(0, fromMs) / cycle);
  for (;;) {
    let at = breath * cycle;
    if (at >= limit) break;
    for (const phase of pattern.phases) {
      const durationMs = phase.seconds * 1000;
      if (at >= limit) break;
      if (at >= fromMs) cues.push({ atMs: at, kind: phase.kind, durationMs });
      at += durationMs;
    }
    breath++;
  }
  if (endMs != null && endMs >= fromMs) cues.push({ atMs: endMs, kind: 'end', durationMs: 0 });
  return cues;
}
