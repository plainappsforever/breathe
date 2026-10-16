import type { Pattern, Phase, SessionTarget } from './patterns';
import { buildSchedule, cycleMs, locate, OPEN_MAX_MS, sessionEndMs, targetDisplayMs, type ScheduledCue } from './session-schedule';

/** Horizon for a cue list without an end (none since v3.1: Open sessions end at OPEN_MAX_MS, 2 h). */
export const OPEN_RUNNER_HORIZON_MS = OPEN_MAX_MS;

/**
 * Drift-corrected session scheduler (DECISIONS D12). Every phase boundary is scheduled from an
 * absolute offset since session start, never chained from the previous timeout's firing time, so a
 * single late callback does not compound into later phases drifting further.
 */

export type SessionPhaseEvent = {
  phase: Phase;
  /** Index of this phase within pattern.phases. */
  phaseIndex: number;
  /** 0-based count of full breaths completed before this phase. */
  breathIndex: number;
  /** Milliseconds since session start (excluding paused time) at which this phase began. */
  offsetMs: number;
  /** How far into this phase the session already is: 0 normally, > 0 when resuming mid-phase after a crash. */
  phaseElapsedMs: number;
};

export type SessionTickEvent = {
  elapsedMs: number;
  /** null for Open sessions, which have no planned end. Counts to the breath boundary once "end after this breath" is set. */
  remainingMs: number | null;
};

export type SessionEndEvent = {
  actualSeconds: number;
  breaths: number;
  /** true if the session ran its full planned duration; false if the user ended it early. */
  completed: boolean;
};

export type SessionEngineOptions = {
  pattern: Pattern;
  /** Minutes, breath count, or Open (runs until end() / finishAfterCycle()). */
  target: SessionTarget;
  now?: () => number;
  setTimeoutFn?: (cb: () => void, ms: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
  setIntervalFn?: (cb: () => void, ms: number) => unknown;
  clearIntervalFn?: (handle: unknown) => void;
  tickIntervalMs?: number;
  onPhaseStart?: (event: SessionPhaseEvent) => void;
  onTick?: (event: SessionTickEvent) => void;
  onEnd?: (event: SessionEndEvent) => void;
};

export type SessionState = 'idle' | 'running' | 'paused' | 'ended';

export class SessionEngine {
  private readonly pattern: Pattern;
  /** Offset of the breath boundary at which the session stops by itself; null = runs until ended. */
  private stopAtMs: number | null;
  /** Length shown as the countdown target (minutes as chosen, not rounded up to a breath). */
  private displayEndMs: number | null;
  private readonly now: () => number;
  private readonly setTimeoutFn: (cb: () => void, ms: number) => unknown;
  private readonly clearTimeoutFn: (handle: unknown) => void;
  private readonly setIntervalFn: (cb: () => void, ms: number) => unknown;
  private readonly clearIntervalFn: (handle: unknown) => void;
  private readonly tickIntervalMs: number;
  private readonly onPhaseStart?: (event: SessionPhaseEvent) => void;
  private readonly onTick?: (event: SessionTickEvent) => void;
  private readonly onEnd?: (event: SessionEndEvent) => void;

  private _state: SessionState = 'idle';
  private startTime = 0;
  private pauseElapsedMs = 0;
  private phaseTimer: unknown = null;
  private tickTimer: unknown = null;
  private phaseIndex = 0;
  private breathIndex = 0;
  private completedBreaths = 0;
  private phaseStartOffsetMs = 0;
  private finishRequested = false;

  constructor(options: SessionEngineOptions) {
    if (options.pattern.phases.length === 0) throw new Error('Pattern must have at least one phase.');
    this.pattern = options.pattern;
    // Open sessions stop by themselves after 2 hours (sessionEndMs); their screen still counts up (no countdown).
    this.stopAtMs = sessionEndMs(options.pattern, options.target);
    this.displayEndMs = targetDisplayMs(options.pattern, options.target);
    this.now = options.now ?? Date.now;
    this.setTimeoutFn = options.setTimeoutFn ?? ((cb, ms) => setTimeout(cb, ms));
    this.clearTimeoutFn = options.clearTimeoutFn ?? ((handle) => clearTimeout(handle as Parameters<typeof clearTimeout>[0]));
    this.setIntervalFn = options.setIntervalFn ?? ((cb, ms) => setInterval(cb, ms));
    this.clearIntervalFn = options.clearIntervalFn ?? ((handle) => clearInterval(handle as Parameters<typeof clearInterval>[0]));
    this.tickIntervalMs = options.tickIntervalMs ?? 250;
    this.onPhaseStart = options.onPhaseStart;
    this.onTick = options.onTick;
    this.onEnd = options.onEnd;
  }

  get state(): SessionState {
    return this._state;
  }

  /** Milliseconds of session time elapsed so far (excluding time spent paused). */
  getElapsedMs(): number {
    return this._state === 'paused' ? this.pauseElapsedMs : this.now() - this.startTime;
  }

  /** True once "end after this breath" has been requested. */
  get finishing(): boolean {
    return this.finishRequested;
  }

  /** Starts the session; fromMs > 0 continues a session that was already fromMs in (crash recovery). */
  start(fromMs = 0): void {
    if (this._state !== 'idle') return;
    this.startTime = this.now() - fromMs;
    this._state = 'running';
    if (this.stopAtMs != null && fromMs >= this.stopAtMs) {
      this.finish(this.stopAtMs, true);
      return;
    }
    const position = locate(this.pattern, fromMs);
    this.phaseIndex = position.phaseIndex;
    this.breathIndex = position.breathIndex;
    this.completedBreaths = position.breathIndex;
    this.phaseStartOffsetMs = position.phaseStartOffsetMs;
    this.emitPhaseStart(fromMs - position.phaseStartOffsetMs);
    this.scheduleNextPhase();
    this.scheduleTick();
  }

  pause(): void {
    if (this._state !== 'running') return;
    this.pauseElapsedMs = this.now() - this.startTime;
    this.clearPhaseTimer();
    this.clearTick();
    this._state = 'paused';
  }

  resume(): void {
    if (this._state !== 'paused') return;
    this.startTime = this.now() - this.pauseElapsedMs;
    this._state = 'running';
    this.scheduleNextPhase();
    this.scheduleTick();
  }

  /**
   * Finish at the end of the current breath instead of now ("End after this breath"). Counts as a
   * completed session. Safe to call while paused; call resume() afterwards to let the breath finish.
   */
  finishAfterCycle(): void {
    if (this._state !== 'running' && this._state !== 'paused') return;
    const before = this.pattern.phases.slice(0, this.phaseIndex).reduce((sum, p) => sum + p.seconds * 1000, 0);
    const boundary = this.phaseStartOffsetMs - before + cycleMs(this.pattern);
    if (this.stopAtMs == null || boundary < this.stopAtMs) this.stopAtMs = boundary;
    this.displayEndMs = this.stopAtMs;
    this.finishRequested = true;
  }

  /** User-initiated end (tapping "End"). Sessions that finish on schedule call finish() internally instead. */
  end(): void {
    if (this._state !== 'running' && this._state !== 'paused') return;
    const elapsedMs = this._state === 'paused' ? this.pauseElapsedMs : this.now() - this.startTime;
    this.finish(elapsedMs, false);
  }

  private currentPhase(): Phase {
    return this.pattern.phases[this.phaseIndex];
  }

  private scheduleNextPhase(): void {
    const durationMs = this.currentPhase().seconds * 1000;
    const nextOffsetMs = this.phaseStartOffsetMs + durationMs;
    const delay = Math.max(0, nextOffsetMs - (this.now() - this.startTime));
    this.phaseTimer = this.setTimeoutFn(() => this.advance(nextOffsetMs), delay);
  }

  private advance(scheduledOffsetMs: number): void {
    // After a long stall (Android freezes JS timers while the screen is locked) the timer fires far
    // past its boundary. Jump straight to where the session is now instead of replaying every missed
    // phase in a burst on unlock (D32, D39).
    const elapsedMs = this.now() - this.startTime;
    const nextIndex = (this.phaseIndex + 1) % this.pattern.phases.length;
    if (elapsedMs >= scheduledOffsetMs + this.pattern.phases[nextIndex].seconds * 1000) {
      this.catchUp(elapsedMs);
      return;
    }

    this.phaseIndex++;
    if (this.phaseIndex >= this.pattern.phases.length) {
      this.phaseIndex = 0;
      this.breathIndex++;
      this.completedBreaths++;
    }
    this.phaseStartOffsetMs = scheduledOffsetMs;

    if (this.stopAtMs != null && this.phaseIndex === 0 && this.phaseStartOffsetMs >= this.stopAtMs) {
      this.finish(this.phaseStartOffsetMs, true);
      return;
    }

    this.emitPhaseStart(0);
    this.scheduleNextPhase();
  }

  private catchUp(elapsedMs: number): void {
    if (this.stopAtMs != null && elapsedMs >= this.stopAtMs) {
      this.completedBreaths = Math.round(this.stopAtMs / cycleMs(this.pattern));
      this.finish(this.stopAtMs, true);
      return;
    }
    const position = locate(this.pattern, elapsedMs);
    this.phaseIndex = position.phaseIndex;
    this.breathIndex = position.breathIndex;
    this.completedBreaths = position.breathIndex;
    this.phaseStartOffsetMs = position.phaseStartOffsetMs;
    this.emitPhaseStart(elapsedMs - position.phaseStartOffsetMs);
    this.scheduleNextPhase();
  }

  /**
   * The cue list from fromMs to the current planned end (including a changed end after
   * finishAfterCycle), built by buildSchedule so the Android native scheduler plays exactly the
   * boundaries this engine draws (one source of truth, D12). Open sessions stop at horizonMs.
   */
  cueSchedule(fromMs: number, horizonMs = OPEN_RUNNER_HORIZON_MS): ScheduledCue[] {
    const target: SessionTarget =
      this.stopAtMs == null ? { kind: 'open' } : { kind: 'breaths', value: Math.round(this.stopAtMs / cycleMs(this.pattern)) };
    return buildSchedule(this.pattern, target, fromMs, { horizonMs });
  }

  /** The countdown's end offset (null for Open), for surfaces outside the app such as a notification. */
  get displayEnd(): number | null {
    return this.displayEndMs;
  }

  private finish(elapsedMs: number, completed: boolean): void {
    this._state = 'ended';
    this.clearPhaseTimer();
    this.clearTick();
    this.onEnd?.({ actualSeconds: elapsedMs / 1000, breaths: this.completedBreaths, completed });
  }

  private emitPhaseStart(phaseElapsedMs: number): void {
    this.onPhaseStart?.({
      phase: this.currentPhase(),
      phaseIndex: this.phaseIndex,
      breathIndex: this.breathIndex,
      offsetMs: this.phaseStartOffsetMs,
      phaseElapsedMs,
    });
  }

  private scheduleTick(): void {
    this.tickTimer = this.setIntervalFn(() => {
      const elapsedMs = this.now() - this.startTime;
      const remainingMs = this.displayEndMs != null ? Math.max(0, this.displayEndMs - elapsedMs) : null;
      this.onTick?.({ elapsedMs, remainingMs });
    }, this.tickIntervalMs);
  }

  private clearPhaseTimer(): void {
    if (this.phaseTimer != null) {
      this.clearTimeoutFn(this.phaseTimer);
      this.phaseTimer = null;
    }
  }

  private clearTick(): void {
    if (this.tickTimer != null) {
      this.clearIntervalFn(this.tickTimer);
      this.tickTimer = null;
    }
  }
}
