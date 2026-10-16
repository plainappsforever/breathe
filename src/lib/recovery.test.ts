import type { ActiveSession } from '@/db/active-session';

import { evaluateActiveSession, guidedElapsedMs, MAX_PAUSED_MS, MAX_RESUME_OPEN_MS, savedOutcome } from './recovery';

const phases = [
  { kind: 'inhale' as const, seconds: 4 },
  { kind: 'exhale' as const, seconds: 6 },
];

const T0 = 1_000_000;

function session(overrides: Partial<ActiveSession> = {}): ActiveSession {
  return {
    patternId: 'slow',
    patternName: 'Slow',
    phases,
    target: 'm:1',
    startedAt: T0,
    startTime: T0,
    pausedElapsedMs: null,
    pausedAt: null,
    guidedMs: 0,
    guidedAt: T0,
    ...overrides,
  };
}

describe('guidedElapsedMs', () => {
  it('is the confirmed guided time, never more than the wall clock allows', () => {
    expect(guidedElapsedMs(session({ guidedMs: 20_000 }), T0 + 60_000)).toBe(20_000);
    expect(guidedElapsedMs(session({ guidedMs: 90_000 }), T0 + 30_000)).toBe(30_000);
  });

  it('is the paused time while paused, and 0 for a pre-v3.1 record without confirmation', () => {
    expect(guidedElapsedMs(session({ pausedElapsedMs: 12_000, pausedAt: T0 + 50_000, guidedMs: 40_000 }), T0 + 99_000)).toBe(12_000);
    expect(guidedElapsedMs(session({ guidedMs: undefined, guidedAt: undefined }), T0 + 30_000)).toBe(0);
  });
});

describe('evaluateActiveSession (v3.1: only guided time counts)', () => {
  it('offers to resume inside the planned length, from where the guidance stopped (not where the clock is)', () => {
    expect(evaluateActiveSession(session({ guidedMs: 15_000 }), T0 + 25_000)).toEqual({ status: 'resume', elapsedMs: 15_000 });
  });

  it('killed 1 minute into a 60-minute session and opened the next day: 1 guided minute, partial, interrupted', () => {
    const killed = session({ target: 'm:60', guidedMs: 60_000, guidedAt: T0 + 60_000 });
    expect(evaluateActiveSession(killed, T0 + 24 * 60 * 60_000)).toEqual({
      status: 'finished',
      actualSeconds: 60,
      breaths: 6,
      completed: false,
      interrupted: true,
    });
  });

  it('saves completed at the planned length only when the guidance itself reached the end', () => {
    expect(evaluateActiveSession(session({ guidedMs: 60_000 }), T0 + 5 * 60_000)).toEqual({
      status: 'finished',
      actualSeconds: 60,
      breaths: 6,
      completed: true,
      interrupted: false,
    });
  });

  it('a session past its planned end whose guidance stopped early is partial, not completed', () => {
    expect(evaluateActiveSession(session({ guidedMs: 45_000 }), T0 + 5 * 60_000)).toMatchObject({
      status: 'finished',
      actualSeconds: 45,
      breaths: 4,
      completed: false,
      interrupted: true,
    });
  });

  it('rounds a minutes target up to the breath boundary when the guidance reached it', () => {
    const box = [
      { kind: 'inhale' as const, seconds: 4 },
      { kind: 'hold' as const, seconds: 4 },
      { kind: 'exhale' as const, seconds: 4 },
      { kind: 'hold' as const, seconds: 4 },
    ];
    expect(evaluateActiveSession(session({ phases: box, target: 'm:1', guidedMs: 64_000 }), T0 + 10 * 60_000)).toMatchObject({
      status: 'finished',
      actualSeconds: 64,
      breaths: 4,
      completed: true,
    });
  });

  it('handles breath targets', () => {
    expect(evaluateActiveSession(session({ target: 'b:3', guidedMs: 20_000 }), T0 + 29_999)).toEqual({ status: 'resume', elapsedMs: 20_000 });
    expect(evaluateActiveSession(session({ target: 'b:3', guidedMs: 20_000 }), T0 + 30_000)).toMatchObject({ status: 'finished', actualSeconds: 20, completed: false });
  });

  it('resumes a paused session at its paused time, however long ago (within a day)', () => {
    const paused = session({ pausedElapsedMs: 20_000, pausedAt: T0 + 100_000 });
    expect(evaluateActiveSession(paused, T0 + 100_000 + 60 * 60_000)).toEqual({ status: 'resume', elapsedMs: 20_000 });
  });

  it('saves a session paused for over a day as a partial one at the paused time', () => {
    const paused = session({ pausedElapsedMs: 25_000, pausedAt: T0 + 100_000 });
    expect(evaluateActiveSession(paused, T0 + 100_000 + MAX_PAUSED_MS + 1)).toEqual({
      status: 'finished',
      actualSeconds: 25,
      breaths: 2,
      completed: false,
      interrupted: true,
    });
  });

  it('Open: resumes a recent one; a stale one saves only its guided time (it used to be discarded)', () => {
    expect(evaluateActiveSession(session({ target: 'open', guidedMs: 30 * 60_000 }), T0 + 31 * 60_000)).toEqual({ status: 'resume', elapsedMs: 30 * 60_000 });
    expect(evaluateActiveSession(session({ target: 'open', guidedMs: 40 * 60_000 }), T0 + MAX_RESUME_OPEN_MS + 1)).toEqual({
      status: 'finished',
      actualSeconds: 2400,
      breaths: 240,
      completed: false,
      interrupted: true,
    });
  });

  it('a record from before v3.1 (no confirmation) saves nothing guided: 0 s, below the save minimum', () => {
    expect(evaluateActiveSession(session({ guidedMs: undefined }), T0 + 5 * 60_000)).toMatchObject({ status: 'finished', actualSeconds: 0, completed: false });
  });

  it('discards records it cannot understand', () => {
    expect(evaluateActiveSession(session({ target: 'zzz' }), 2_000_000)).toEqual({ status: 'discard' });
    expect(evaluateActiveSession(session({ phases: [] }), 2_000_000)).toEqual({ status: 'discard' });
  });
});

describe('savedOutcome (starting fresh over an offered session)', () => {
  it('saves the guided part as partial instead of throwing it away (REVIEW_V3 #15)', () => {
    expect(savedOutcome(session({ guidedMs: 30_000 }), T0 + 40_000)).toEqual({
      status: 'finished',
      actualSeconds: 30,
      breaths: 3,
      completed: false,
      interrupted: true,
    });
  });
});
