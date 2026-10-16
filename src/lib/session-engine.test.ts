import { findPreset, PRESETS, type Pattern } from './patterns';
import { SessionEngine, type SessionEndEvent, type SessionPhaseEvent } from './session-engine';
import { buildSchedule } from './session-schedule';

/**
 * A controllable virtual clock + timer queue, used instead of jest's fake timers so tests can inject
 * precise firing lag to prove the scheduler's drift correction (DECISIONS D12).
 */
class FakeClock {
  now = 0;
  private nextId = 1;
  private timers: { id: number; fireAt: number; cb: () => void }[] = [];

  getNow = (): number => this.now;

  setTimeout = (cb: () => void, ms: number): number => {
    const id = this.nextId++;
    this.timers.push({ id, fireAt: this.now + ms, cb });
    return id;
  };

  clearTimeout = (id: unknown): void => {
    this.timers = this.timers.filter((t) => t.id !== id);
  };

  /** Fire the earliest pending timer, landing the clock `lagMs` after its nominal fire time. */
  fireNextWithLag(lagMs: number): boolean {
    if (this.timers.length === 0) return false;
    const due = [...this.timers].sort((a, b) => a.fireAt - b.fireAt)[0];
    this.now = due.fireAt + lagMs;
    this.timers = this.timers.filter((t) => t.id !== due.id);
    due.cb();
    return true;
  }

  hasPending(): boolean {
    return this.timers.length > 0;
  }
}

function makeEngine(
  clock: FakeClock,
  pattern: Pattern,
  totalSeconds: number | null,
  handlers: { onPhaseStart?: (e: SessionPhaseEvent) => void; onEnd?: (e: SessionEndEvent) => void } = {}
): SessionEngine {
  return new SessionEngine({
    pattern,
    target: totalSeconds == null ? { kind: 'open' } : { kind: 'minutes', value: totalSeconds / 60 },
    now: clock.getNow,
    setTimeoutFn: clock.setTimeout,
    clearTimeoutFn: clock.clearTimeout,
    setIntervalFn: () => 0,
    clearIntervalFn: () => {},
    ...handlers,
  });
}

function expectedNominalOffsets(pattern: Pattern, totalSeconds: number): number[] {
  const totalMs = totalSeconds * 1000;
  const offsets: number[] = [0];
  let cumulative = 0;
  let phaseIndex = 0;
  while (true) {
    cumulative += pattern.phases[phaseIndex].seconds * 1000;
    phaseIndex++;
    const wrapped = phaseIndex >= pattern.phases.length;
    if (wrapped) phaseIndex = 0;
    if (wrapped && cumulative >= totalMs) {
      offsets.push(cumulative); // final boundary, session ends here (not a phaseStart)
      break;
    }
    offsets.push(cumulative);
  }
  return offsets;
}

describe('SessionEngine schedule', () => {
  it.each(PRESETS.map((p) => [p.id, p] as const))('%s: phase boundaries match the pattern for a 3-minute session', (_id, pattern) => {
    const clock = new FakeClock();
    const offsets: number[] = [];
    let endEvent: SessionEndEvent | undefined;
    const engine = makeEngine(clock, pattern, 180, {
      onPhaseStart: (e) => offsets.push(e.offsetMs),
      onEnd: (e) => (endEvent = e),
    });
    engine.start();
    while (engine.state === 'running') clock.fireNextWithLag(0);

    const expected = expectedNominalOffsets(pattern, 180);
    const expectedPhaseStarts = expected.slice(0, -1);
    expect(offsets).toEqual(expectedPhaseStarts);
    expect(endEvent?.completed).toBe(true);
    expect(endEvent?.actualSeconds).toBe(expected[expected.length - 1] / 1000);
  });

  it('breath count is correct: 1 minute of Slow (10s breaths) is exactly 6 breaths', () => {
    const clock = new FakeClock();
    let endEvent: SessionEndEvent | undefined;
    const engine = makeEngine(clock, findPreset('slow')!, 60, { onEnd: (e) => (endEvent = e) });
    engine.start();
    while (engine.state === 'running') clock.fireNextWithLag(0);
    expect(endEvent).toEqual({ actualSeconds: 60, breaths: 6, completed: true });
  });

  it('Open sessions run on (no countdown) and end by themselves at the first breath boundary after 2 hours', () => {
    const clock = new FakeClock();
    let endEvent: SessionEndEvent | undefined;
    const engine = makeEngine(clock, findPreset('slow')!, null, { onEnd: (e) => (endEvent = e) });
    engine.start();
    for (let i = 0; i < 100; i++) clock.fireNextWithLag(0);
    expect(endEvent).toBeUndefined();
    expect(engine.state).toBe('running');
    expect(engine.displayEnd).toBeNull();
    while (engine.state === 'running') clock.fireNextWithLag(0);
    expect(endEvent).toEqual({ actualSeconds: 7200, breaths: 720, completed: true });
  });

  it('a manual end() reports the elapsed time and breaths so far, not completed', () => {
    const clock = new FakeClock();
    let endEvent: SessionEndEvent | undefined;
    const engine = makeEngine(clock, findPreset('slow')!, null, { onEnd: (e) => (endEvent = e) });
    engine.start();
    clock.fireNextWithLag(0); // end of inhale, offset 4000
    clock.fireNextWithLag(0); // end of exhale, offset 10000 -> breath 1 complete
    clock.now = 12000;
    engine.end();
    expect(endEvent).toEqual({ actualSeconds: 12, breaths: 1, completed: false });
  });

  it('pause/resume keeps the remaining phase time, ignoring time spent paused', () => {
    const clock = new FakeClock();
    const offsets: number[] = [];
    const engine = makeEngine(clock, findPreset('slow')!, 180, { onPhaseStart: (e) => offsets.push(e.offsetMs) });
    engine.start(); // inhale starts at offset 0

    clock.now = 2000; // 2s into the 4s inhale
    engine.pause();
    clock.now = 500_000; // a long time passes while paused
    engine.resume();

    // The inhale had 2s remaining at pause; resuming should fire its end 2s of *scheduler* time later.
    expect(clock.hasPending()).toBe(true);
    clock.fireNextWithLag(0);
    expect(clock.now).toBe(502_000);
    expect(offsets).toEqual([0, 4000]);
  });
});

describe('SessionEngine: leaving without locked mode (v3.1 F3, REVIEW_V3 #4)', () => {
  it('a session paused when the app left counts only the guided time, however long the user was away', () => {
    const clock = new FakeClock();
    let endEvent: SessionEndEvent | undefined;
    const engine = makeEngine(clock, findPreset('slow')!, 600, { onEnd: (e) => (endEvent = e) });
    engine.start();
    clock.fireNextWithLag(0); // exhale at 4 s
    clock.now = 65_000; // the app leaves the screen 65 s in (the test fires no timers in between): Home pauses
    engine.pause();
    clock.now = 65_000 + 3 * 60 * 60_000; // back three hours later, past the planned 10 minutes
    engine.end();
    expect(endEvent).toEqual({ actualSeconds: 65, breaths: 0, completed: false });
    expect(clock.hasPending()).toBe(false);
  });

  it('without the pause, a stall past the planned end would count as completed (the path Home now avoids)', () => {
    const clock = new FakeClock();
    let endEvent: SessionEndEvent | undefined;
    const engine = makeEngine(clock, findPreset('slow')!, 600, { onEnd: (e) => (endEvent = e) });
    engine.start();
    clock.fireNextWithLag(3 * 60 * 60_000);
    expect(endEvent).toMatchObject({ actualSeconds: 600, completed: true });
  });
});

describe('SessionEngine drift correction', () => {
  it('a single late-firing timeout does not compound into later phase boundaries', () => {
    const clock = new FakeClock();
    const actualFireTimes: number[] = [];
    const nominalOffsets: number[] = [];
    const engine = makeEngine(clock, findPreset('slow')!, 60, {
      onPhaseStart: (e) => {
        actualFireTimes.push(clock.getNow());
        nominalOffsets.push(e.offsetMs);
      },
    });
    engine.start(); // offset 0, fires synchronously, no lag possible

    clock.fireNextWithLag(120); // end of inhale (nominal 4000ms) fires 120ms late
    while (engine.state === 'running') clock.fireNextWithLag(0);

    // The glitched boundary is inherently late (the callback could not have run earlier).
    expect(actualFireTimes[1] - nominalOffsets[1]).toBe(120);
    // Every boundary after it recovers to within 50ms of its nominal target instead of staying 120ms behind.
    for (let i = 2; i < nominalOffsets.length; i++) {
      expect(Math.abs(actualFireTimes[i] - nominalOffsets[i])).toBeLessThanOrEqual(50);
    }
  });
});

describe('SessionEngine targets', () => {
  function run(clock: FakeClock, engine: SessionEngine) {
    engine.start();
    while (engine.state === 'running') clock.fireNextWithLag(0);
  }

  it('a breath-count target ends after exactly that many breaths', () => {
    const clock = new FakeClock();
    let endEvent: SessionEndEvent | undefined;
    const engine = new SessionEngine({
      pattern: findPreset('box')!,
      target: { kind: 'breaths', value: 3 },
      now: clock.getNow,
      setTimeoutFn: clock.setTimeout,
      clearTimeoutFn: clock.clearTimeout,
      setIntervalFn: () => 0,
      clearIntervalFn: () => {},
      onEnd: (e) => (endEvent = e),
    });
    run(clock, engine);
    expect(endEvent).toEqual({ actualSeconds: 48, breaths: 3, completed: true });
  });

  it('a minutes target ends on the next breath boundary (Box 1 min = 4 breaths, 64 s)', () => {
    const clock = new FakeClock();
    let endEvent: SessionEndEvent | undefined;
    const engine = makeEngine(clock, findPreset('box')!, 60, { onEnd: (e) => (endEvent = e) });
    run(clock, engine);
    expect(endEvent).toEqual({ actualSeconds: 64, breaths: 4, completed: true });
  });

  it('finishAfterCycle ends an Open session at the end of the current breath', () => {
    const clock = new FakeClock();
    let endEvent: SessionEndEvent | undefined;
    const engine = makeEngine(clock, findPreset('slow')!, null, { onEnd: (e) => (endEvent = e) });
    engine.start();
    clock.fireNextWithLag(0); // exhale starts at 4 s
    clock.fireNextWithLag(0); // breath 2 starts at 10 s
    clock.now = 12_000; // 2 s into breath 2's inhale
    engine.finishAfterCycle();
    expect(engine.finishing).toBe(true);
    while (engine.state === 'running') clock.fireNextWithLag(0);
    expect(endEvent).toEqual({ actualSeconds: 20, breaths: 2, completed: true });
  });

  it('finishAfterCycle while paused works after resume, and never extends a nearer planned end', () => {
    const clock = new FakeClock();
    let endEvent: SessionEndEvent | undefined;
    const engine = new SessionEngine({
      pattern: findPreset('slow')!,
      target: { kind: 'breaths', value: 2 },
      now: clock.getNow,
      setTimeoutFn: clock.setTimeout,
      clearTimeoutFn: clock.clearTimeout,
      setIntervalFn: () => 0,
      clearIntervalFn: () => {},
      onEnd: (e) => (endEvent = e),
    });
    engine.start();
    clock.now = 3000;
    engine.pause();
    engine.finishAfterCycle(); // current breath ends at 10 s, earlier than the planned 20 s
    engine.resume();
    while (engine.state === 'running') clock.fireNextWithLag(0);
    expect(endEvent).toEqual({ actualSeconds: 10, breaths: 1, completed: true });

    const clock2 = new FakeClock();
    let end2: SessionEndEvent | undefined;
    const engine2 = new SessionEngine({
      pattern: findPreset('slow')!,
      target: { kind: 'breaths', value: 1 },
      now: clock2.getNow,
      setTimeoutFn: clock2.setTimeout,
      clearTimeoutFn: clock2.clearTimeout,
      setIntervalFn: () => 0,
      clearIntervalFn: () => {},
      onEnd: (e) => (end2 = e),
    });
    engine2.start();
    engine2.finishAfterCycle();
    while (engine2.state === 'running') clock2.fireNextWithLag(0);
    expect(end2).toEqual({ actualSeconds: 10, breaths: 1, completed: true });
  });

  it('start(fromMs) continues mid-phase: first event carries the elapsed part of the phase', () => {
    const clock = new FakeClock();
    clock.now = 1_000_000;
    const events: { phaseIndex: number; offsetMs: number; phaseElapsedMs: number; breathIndex: number }[] = [];
    let endEvent: SessionEndEvent | undefined;
    const engine = makeEngine(clock, findPreset('slow')!, 60, {
      onPhaseStart: (e) => events.push({ phaseIndex: e.phaseIndex, offsetMs: e.offsetMs, phaseElapsedMs: e.phaseElapsedMs, breathIndex: e.breathIndex }),
      onEnd: (e) => (endEvent = e),
    });
    engine.start(47_000); // 7 s into breath 5 (offset 40 s..50 s): exhale started at 44 s
    expect(events[0]).toEqual({ phaseIndex: 1, offsetMs: 44_000, phaseElapsedMs: 3000, breathIndex: 4 });
    expect(engine.getElapsedMs()).toBe(47_000);
    while (engine.state === 'running') clock.fireNextWithLag(0);
    expect(endEvent).toEqual({ actualSeconds: 60, breaths: 6, completed: true });
  });

  it('start(fromMs) at or after the planned end finishes immediately as completed', () => {
    const clock = new FakeClock();
    let endEvent: SessionEndEvent | undefined;
    const engine = makeEngine(clock, findPreset('slow')!, 60, { onEnd: (e) => (endEvent = e) });
    engine.start(75_000);
    expect(engine.state).toBe('ended');
    expect(endEvent).toEqual({ actualSeconds: 60, breaths: 0, completed: true });
  });
});

describe('SessionEngine catch-up after a timer stall (Android lock, D39)', () => {
  it('a timer that fires 65 s late jumps to the current phase instead of replaying every missed one', () => {
    const clock = new FakeClock();
    const events: SessionPhaseEvent[] = [];
    const engine = makeEngine(clock, findPreset('slow')!, 180, { onPhaseStart: (e) => events.push(e) });
    engine.start();
    clock.fireNextWithLag(0); // exhale at 4 s
    // End of exhale is due at 10 s; JS was frozen until 75.5 s (breath 7, inhale runs 70-74, exhale 74-80).
    clock.fireNextWithLag(65_500);
    expect(events).toHaveLength(3);
    expect(events[2]).toMatchObject({ phaseIndex: 1, breathIndex: 7, offsetMs: 74_000, phaseElapsedMs: 1_500 });
    // Afterwards it continues on the normal schedule: next boundary at exactly 80 s.
    clock.fireNextWithLag(0);
    expect(clock.now).toBe(80_000);
    expect(events[3]).toMatchObject({ phaseIndex: 0, breathIndex: 8, offsetMs: 80_000, phaseElapsedMs: 0 });
  });

  it('a stall past the planned end finishes as completed at the planned end, with the full breath count', () => {
    const clock = new FakeClock();
    let endEvent: SessionEndEvent | undefined;
    const events: SessionPhaseEvent[] = [];
    const engine = makeEngine(clock, findPreset('slow')!, 60, { onPhaseStart: (e) => events.push(e), onEnd: (e) => (endEvent = e) });
    engine.start();
    clock.fireNextWithLag(90_000);
    expect(events).toHaveLength(1);
    expect(endEvent).toEqual({ actualSeconds: 60, breaths: 6, completed: true });
  });

  it('ordinary lag (shorter than the next phase) still steps one phase at a time', () => {
    const clock = new FakeClock();
    const events: SessionPhaseEvent[] = [];
    const engine = makeEngine(clock, findPreset('slow')!, 60, { onPhaseStart: (e) => events.push(e) });
    engine.start();
    clock.fireNextWithLag(5_900); // exhale (6 s) due at 4 s, fires at 9.9 s: still inside it
    expect(events[1]).toMatchObject({ phaseIndex: 1, offsetMs: 4_000, phaseElapsedMs: 0 });
  });
});

describe('SessionEngine.cueSchedule (what the Android native scheduler plays)', () => {
  it('equals buildSchedule for a minutes target', () => {
    const clock = new FakeClock();
    const box = findPreset('box')!;
    const engine = makeEngine(clock, box, 180);
    expect(engine.cueSchedule(0)).toEqual(buildSchedule(box, { kind: 'minutes', value: 3 }, 0));
    expect(engine.cueSchedule(50_000)).toEqual(buildSchedule(box, { kind: 'minutes', value: 3 }, 50_000));
  });

  it('follows "end after this breath": the list stops at the current breath boundary', () => {
    const clock = new FakeClock();
    const slow = findPreset('slow')!;
    const engine = makeEngine(clock, slow, null);
    engine.start();
    clock.fireNextWithLag(0); // exhale at 4 s
    clock.fireNextWithLag(0); // breath 2 at 10 s
    clock.now = 12_000;
    engine.finishAfterCycle();
    const cues = engine.cueSchedule(12_000);
    expect(cues).toEqual([
      { atMs: 14_000, kind: 'exhale', durationMs: 6_000 },
      { atMs: 20_000, kind: 'end', durationMs: 0 },
    ]);
    expect(engine.displayEnd).toBe(20_000);
  });

  it('Open sessions hand the runner a list that ends with the end cue at 2 hours (REVIEW_V3 #8)', () => {
    const clock = new FakeClock();
    const engine = makeEngine(clock, findPreset('box')!, null); // 16 s breaths: 2 h = 450 breaths exactly
    const cues = engine.cueSchedule(0);
    expect(cues[cues.length - 1]).toEqual({ atMs: 7_200_000, kind: 'end', durationMs: 0 });
    expect(cues.filter((c) => c.kind === 'end')).toHaveLength(1);
  });
});
