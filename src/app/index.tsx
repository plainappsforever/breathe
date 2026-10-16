import { Link, useFocusEffect, useRouter } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BreathVisual, breathProgress, ORB_BIG, ORB_SMALL } from '@/components/breath-visual';
import { MoodRow } from '@/components/mood-row';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { clearActiveSession, getActiveSession, saveActiveSession, type ActiveSession } from '@/db/active-session';
import { getAppSettings, setBoolSetting, setPattern, setTarget, type AppSettings } from '@/db/app-settings';
import { patternExists, resolvePatternById } from '@/db/custom-patterns';
import { getPatternPrefs, touchPatternUsed, type PatternPrefs } from '@/db/pattern-prefs';
import { recordSession, setSessionMood } from '@/db/sessions';
import { cueForPhase, END_TONE_TAIL_MS, endBackgroundAudio, SessionCues, setBackgroundAudioMode, setForegroundAudioMode } from '@/lib/audio';
import { formatSessionSummary } from '@/lib/format';
import { hapticCapabilities, playEndHaptic, playHoldTick, playPhaseHaptic, stopHaptics } from '@/lib/haptics';
import { consumePendingIntent } from '@/lib/launch-intent';
import { refreshQuickActions } from '@/lib/quick-actions';
import { publishTodayMinutes } from '@/lib/today-widgets';
import { publishLiveActivity } from '@/lib/ios-surfaces';
import {
  findPreset,
  MIN_SAVED_SESSION_SECONDS,
  parseTarget,
  patternFromPhases,
  serializeTarget,
  targetLabel,
  type Pattern,
  type Phase,
  type SessionTarget,
} from '@/lib/patterns';
import { applyPatternPrefs } from '@/lib/pattern-overrides';
import { evaluateActiveSession, GUIDED_HEARTBEAT_MS, savedOutcome, type RecoveryOutcome } from '@/lib/recovery';
import { syncSessionsToHealthIfOn } from '@/lib/health-runner';
import { setSessionRunning } from '@/lib/reminder-notifications';
import { SessionEndEvent, SessionEngine, SessionPhaseEvent } from '@/lib/session-engine';
import { leaveAction } from '@/lib/session-lifecycle';
import { nativeRunnerFor, sessionRunnerModule, type RunnerActionEvent, type SessionRunner } from '@/lib/session-runner';
import { targetPlannedSeconds } from '@/lib/session-schedule';
import { useFadeToDark } from '@/hooks/use-fade-to-dark';
import { useShakeToPause } from '@/hooks/use-shake-to-pause';
import { useTheme } from '@/hooks/use-theme';

/** Short settle before the first breath when the get-ready countdown is Off (v1 behaviour). */
const SETTLE_MS = 1500;
/** Settings > "Start when opened": waits this long after the first Home load for a quick action or reminder to arrive. */
const START_ON_OPEN_GRACE_MS = 800;
/** "Start when opened" applies once per app start (a cold launch), not on every return to Home. */
let startOnOpenConsumed = false;
/** iOS locked mode: a pause longer than this lets the keep-alive bed and the audio session go (REVIEW_V3 #1). */
const PAUSED_BED_MS = 60_000;

type ScreenPhase = 'idle' | 'settling' | 'running' | 'paused' | 'ended';

function phaseWord(kind: Phase['kind']): string {
  if (kind === 'hold') return 'Hold';
  if (kind === 'exhale') return 'Out';
  return 'In';
}

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Orb size a hold should sit at: whatever the phase before it left the orb at. */
function holdScale(pattern: Pattern, phaseIndex: number): number {
  for (let i = phaseIndex - 1; i >= 0; i--) {
    const kind = pattern.phases[i].kind;
    if (kind === 'exhale') return ORB_SMALL;
    if (kind !== 'hold') return ORB_BIG;
  }
  // A hold at the very start of the pattern follows the last phase of the previous breath.
  for (let i = pattern.phases.length - 1; i > phaseIndex; i--) {
    const kind = pattern.phases[i].kind;
    if (kind === 'exhale') return ORB_SMALL;
    if (kind !== 'hold') return ORB_BIG;
  }
  return 1;
}

export default function HomeScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [settings, setSettings] = useState<AppSettings | null>(null);
  // The settings of the session in progress: the globals with the pattern's own overrides on top.
  const [live, setLive] = useState<AppSettings | null>(null);
  const [screenPhase, setScreenPhase] = useState<ScreenPhase>('idle');
  const [currentPhaseEvent, setCurrentPhaseEvent] = useState<SessionPhaseEvent | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [summary, setSummary] = useState<SessionEndEvent | null>(null);
  const [prepLeft, setPrepLeft] = useState<number | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [recoverable, setRecoverable] = useState<ActiveSession | null>(null);
  // Optional mood check-in (V3 P5, off by default). Before: chosen on Home; after: chosen on the end screen.
  const [moodBefore, setMoodBeforeState] = useState<number | null>(null);
  const [moodAfter, setMoodAfter] = useState<number | null>(null);
  const [endedSessionId, setEndedSessionId] = useState<number | null>(null);
  const moodBeforeRef = useRef<number | null>(null);

  const engineRef = useRef<SessionEngine | null>(null);
  // Overrides of the pattern selected on Home (loaded with the settings; applied when a session starts).
  const prefsRef = useRef<PatternPrefs | null>(null);
  const patternRef = useRef<Pattern>(findPreset('slow')!);
  const targetRef = useRef<SessionTarget>({ kind: 'minutes', value: 3 });
  const screenPhaseRef = useRef<ScreenPhase>('idle');
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prepInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const cuesRef = useRef<SessionCues | null>(null);
  // The ended session's cue players while its end tone may still sound; released after END_TONE_TAIL_MS.
  const audioTail = useRef<{ cues: SessionCues; timer: ReturnType<typeof setTimeout> } | null>(null);
  const pausedBedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionStartWallClock = useRef<number | null>(null);
  // The persisted copy of the running session (crash recovery). Writes are chained so they land in order.
  const activeRef = useRef<ActiveSession | null>(null);
  const activeWrites = useRef<Promise<unknown>>(Promise.resolve());
  // Android + "Keep guiding when locked": the native runner owns all cues for this session (D39).
  const runnerRef = useRef<SessionRunner | null>(null);
  // The Live Activity setting of the session in progress (iOS, v3 P7.5).
  const liveActivityOn = useRef(false);
  // Pause/Resume/End from outside the app (notification, headset, a call); always the latest handlers.
  const externalActionRef = useRef<(event: RunnerActionEvent) => void>(() => {});
  // Whether the running session keeps guiding with the app in the background ("Keep guiding when locked").
  const guidesInBackground = useRef(false);
  const lastGuidedWrite = useRef(0);
  // The app left the screen / Android Back: always the latest handlers (v3.1 F3).
  const appStateRef = useRef<(state: string) => void>(() => {});
  // "Keep guiding when locked" armed at the tap, before the get-ready countdown ends (v3.1 F4, REVIEW_V3 #5).
  const prestartRef = useRef<{ startAt: number; runner: boolean } | null>(null);
  const settleArgsRef = useRef<{ base: AppSettings; pattern: Pattern; target: SessionTarget } | null>(null);
  // Countdown interrupted by leaving the app without locked mode: it starts again on return.
  const restartCountdownRef = useRef<{ base: AppSettings; pattern: Pattern; target: SessionTarget } | null>(null);
  const backRef = useRef<() => boolean>(() => false);

  const orbScale = useSharedValue(1);
  const orbOpacity = useSharedValue(1);
  const contentOpacity = useSharedValue(1);

  const sessionActive = screenPhase === 'running' || screenPhase === 'paused';
  const view = live ?? settings;
  const { dimmed, poke } = useFadeToDark(view?.fadeToDark ?? true, screenPhase === 'running', view?.fadeDelay ?? 5);
  const systemReduceMotion = useReducedMotion();
  const reduceMotion = view?.reduceMotion === 'on' || systemReduceMotion;
  useShakeToPause(screenPhase === 'running' && (view?.shakeToPause ?? false), () => pauseSession(false));

  function changeScreenPhase(next: ScreenPhase) {
    screenPhaseRef.current = next;
    setScreenPhase(next);
    // A reminder that arrives mid-session stays out of the way (no banner, no sound) — V3 P6, L10.
    setSessionRunning(next !== 'idle' && next !== 'ended');
  }

  function queueActiveWrite(write: () => Promise<unknown>) {
    activeWrites.current = activeWrites.current.then(write).catch(() => {});
  }

  function persistActive(next: ActiveSession | null) {
    activeRef.current = next;
    queueActiveWrite(() => (next ? saveActiveSession(db, next) : clearActiveSession(db)));
    // iOS Live Activity (v3 P7.5, opt-in): follows every start, pause, resume, "end after this breath" and end.
    publishLiveActivity(
      liveActivityOn.current,
      next && {
        patternName: next.patternName,
        target: parseTarget(next.target) ?? { kind: 'open' },
        startTime: next.startTime,
        displayEndMs: engineRef.current?.displayEnd ?? null,
        pausedElapsedMs: next.pausedElapsedMs,
      }
    );
  }

  /**
   * Confirms how far the running session has really guided (v3.1 F3): recovery after a crash saves only this
   * much. Written at most every GUIDED_HEARTBEAT_MS unless forced; never touches the Live Activity.
   */
  function confirmGuided(elapsedMs: number, force = false) {
    const current = activeRef.current;
    if (!current || current.pausedElapsedMs !== null) return;
    const now = Date.now();
    if (!force && now - lastGuidedWrite.current < GUIDED_HEARTBEAT_MS) return;
    lastGuidedWrite.current = now;
    const next: ActiveSession = { ...current, guidedMs: Math.max(current.guidedMs ?? 0, elapsedMs), guidedAt: now };
    activeRef.current = next;
    queueActiveWrite(() => saveActiveSession(db, next));
  }

  /** Saves an unfinished session the app found (or the user replaced) with only its guided time (REVIEW_V3 #3, #15). */
  async function saveRecovered(active: ActiveSession, outcome: Extract<RecoveryOutcome, { status: 'finished' }>, base: AppSettings) {
    const target = parseTarget(active.target);
    const id = await recordSession(
      db,
      {
        patternName: active.patternName,
        patternId: active.patternId,
        target,
        phases: active.phases,
        plannedSeconds: targetPlannedSeconds(patternFromPhases(active.patternId, active.patternName, active.phases), target ?? { kind: 'open' }),
        actualSeconds: outcome.actualSeconds,
        breaths: outcome.breaths,
        completed: outcome.completed,
        interrupted: outcome.interrupted,
      },
      active.startedAt
    ).catch(() => null);
    if (id !== null) {
      syncSessionsToHealthIfOn(db, base);
      publishTodayMinutes(db);
    }
  }

  /** Reads settings, the selected pattern and any unfinished session; applies a waiting launch intent. */
  const loadHomeOnce = useCallback(async () => {
    await activeWrites.current;
    const loaded = await getAppSettings(db);
    const pattern = await resolvePatternById(db, loaded.patternId);
    const selectedPrefs = await getPatternPrefs(db, loaded.patternId);
    if (screenPhaseRef.current !== 'idle') {
      // A link that arrives while a session is running never starts a second one later.
      consumePendingIntent();
      return;
    }
    patternRef.current = pattern;
    targetRef.current = loaded.target;
    prefsRef.current = selectedPrefs;
    setSettings(loaded);
    // Launcher quick actions follow the default and Recent (v3 P7.1); not awaited, never throws.
    refreshQuickActions(db, loaded.patternId, loaded.target);
    publishTodayMinutes(db); // home-screen widgets (v3 P7.3)

    let unfinished: ActiveSession | null = null;
    const active = await getActiveSession(db);
    if (active) {
      const outcome = evaluateActiveSession(active, Date.now());
      if (outcome.status === 'resume') {
        unfinished = active;
      } else {
        // Only the load that really removed the record saves it (REVIEW_V3 #11: no duplicate in History/Health).
        const removed = await clearActiveSession(db);
        if (removed && outcome.status === 'finished') await saveRecovered(active, outcome, loaded);
      }
    }
    if (screenPhaseRef.current !== 'idle') return;
    // Nothing runs now: end a Live Activity left behind by a session the app did not finish (killed).
    publishLiveActivity(false, null);
    setRecoverable(unfinished);
    syncSessionsToHealthIfOn(db, loaded); // retries sessions Health refused earlier (write-only, only when the toggle is on)

    const intent = consumePendingIntent();
    if (intent) {
      // An explicit start request wins over an unfinished session offered for resuming.
      const id = intent.patternId && (await patternExists(db, intent.patternId)) ? intent.patternId : loaded.patternId;
      const intentPattern = await resolvePatternById(db, id);
      const prefs = await getPatternPrefs(db, id);
      prefsRef.current = prefs;
      const intentTarget = intent.target ?? prefs?.target ?? loaded.target;
      if (screenPhaseRef.current === 'idle') {
        setRecoverable(null);
        startSession(loaded, intentPattern, intentTarget);
      }
    }

    // Settings > "Start when opened" (SPEC section 1, REVIEW_V3 #9): the first Home load after the app starts begins
    // the default session with zero taps, unless a link, quick action or reminder asked for one, or a session waits
    // to be resumed. The short grace lets a cold-start quick action or reminder tap arrive first.
    const firstLoad = !startOnOpenConsumed;
    startOnOpenConsumed = true;
    if (firstLoad && loaded.startOnOpen && !intent && !unfinished) {
      setTimeout(() => {
        if (screenPhaseRef.current === 'idle') startSession(loaded, patternRef.current, targetRef.current);
      }, START_ON_OPEN_GRACE_MS);
    }
    // startSession is a plain function of this component; loadHome only needs to re-run on focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db]);

  // One load at a time (REVIEW_V3 #11): a cold start from a quick action or reminder focuses Home twice while the
  // first load still runs. A request during a load runs once more after it, never alongside it.
  const loadingRef = useRef<Promise<void> | null>(null);
  const reloadRequested = useRef(false);
  const loadHome = useCallback((): Promise<void> => {
    if (loadingRef.current) {
      reloadRequested.current = true;
      return loadingRef.current;
    }
    const run = async () => {
      do {
        reloadRequested.current = false;
        await loadHomeOnce();
      } while (reloadRequested.current);
    };
    const running = run().finally(() => {
      loadingRef.current = null;
    });
    loadingRef.current = running;
    return running;
  }, [loadHomeOnce]);

  useFocusEffect(
    useCallback(() => {
      loadHome().catch(() => {});
    }, [loadHome])
  );

  useEffect(() => {
    externalActionRef.current = (event) => {
      // Pause or End from the notification / headset during a countdown with armed guidance: stop the countdown.
      if (screenPhaseRef.current === 'settling') {
        if (event.action !== 'resume') cancelPrep();
        return;
      }
      if (event.action === 'pause') pauseSession(true);
      else if (event.action === 'resume') resumeSession(true);
      else engineRef.current?.end();
    };
  });

  useEffect(() => {
    const sub = sessionRunnerModule?.addListener('onAction', (event) => externalActionRef.current(event));
    return () => sub?.remove();
  }, []);

  // v3.1 F3 (REVIEW_V3 #4): leaving the app mid-session. With "Keep guiding when locked" the guidance goes on and
  // the progress is confirmed; without it nothing guides any more, so the session pauses instead of "finishing" in
  // the background. Android Back during a session pauses too (easy to press by accident with eyes closed).
  useEffect(() => {
    appStateRef.current = (state) => {
      if (state === 'active') {
        const restart = restartCountdownRef.current;
        restartCountdownRef.current = null;
        if (restart && screenPhaseRef.current === 'idle') startSession(restart.base, restart.pattern, restart.target);
        return;
      }
      if (state !== 'background') return;
      const action = leaveAction(screenPhaseRef.current, guidesInBackground.current);
      const engine = engineRef.current;
      if (action === 'confirm' && engine) confirmGuided(engine.getElapsedMs(), true);
      else if (action === 'pause') pauseSession(false);
      else if (action === 'restartCountdown') {
        const pending = settleArgsRef.current;
        cancelPrep();
        restartCountdownRef.current = pending;
      }
    };
    backRef.current = () => {
      if (screenPhaseRef.current === 'running') {
        pauseSession(false);
        return true;
      }
      if (screenPhaseRef.current === 'settling') {
        cancelPrep();
        return true;
      }
      return false;
    };
  });

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => appStateRef.current(state));
    const back = BackHandler.addEventListener('hardwareBackPress', () => backRef.current());
    return () => {
      sub.remove();
      back.remove();
    };
  }, []);

  // Both return promises that reject when the activity is already gone (Android Back during the get-ready countdown
  // showed a red error screen in dev builds, P8); keeping the screen on is best-effort, so the errors are dropped.
  useEffect(() => {
    if (sessionActive) activateKeepAwakeAsync('session').catch(() => {});
    else deactivateKeepAwake('session').catch(() => {});
    return () => {
      deactivateKeepAwake('session').catch(() => {});
    };
  }, [sessionActive]);

  useEffect(() => {
    contentOpacity.value = withTiming(dimmed ? 0.15 : 1, { duration: 400 });
  }, [dimmed, contentOpacity]);

  useEffect(() => {
    if (settings && !settings.hasSeenFirstRun) {
      setBoolSetting(db, 'hasSeenFirstRun', true).catch(() => {});
    }
    // Fire-and-forget, once, when settings first load with the flag unset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.hasSeenFirstRun]);

  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
      if (prepInterval.current) clearInterval(prepInterval.current);
      if (holdTickTimer.current) clearTimeout(holdTickTimer.current);
      if (pausedBedTimer.current) clearTimeout(pausedBedTimer.current);
      engineRef.current?.end();
      runnerRef.current?.stop();
      if (prestartRef.current?.runner) nativeRunnerFor(true)?.stop();
      flushAudioTail();
      if (cuesRef.current) {
        cuesRef.current.release();
        cuesRef.current = null;
        endBackgroundAudio();
      }
      stopHaptics();
    },
    []
  );

  // Dev-only background probe (v3.1 F1): while the app is in the background it logs every 5 s. iOS suspends an app
  // that plays nothing, so the lines stop a few seconds after a session's audio is released.
  useEffect(() => {
    if (!__DEV__) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const sub = AppState.addEventListener('change', (state) => {
      if (timer) clearInterval(timer);
      timer = null;
      if (state !== 'background') return;
      const since = Date.now();
      timer = setInterval(() => console.log('[bg] alive', Math.round((Date.now() - since) / 1000), 's', screenPhaseRef.current), 5000);
    });
    return () => {
      sub.remove();
      if (timer) clearInterval(timer);
    };
  }, []);

  /** Releases an ended session's cue players at once (a new session starts, or Home unmounts). */
  function flushAudioTail() {
    const tail = audioTail.current;
    if (!tail) return;
    audioTail.current = null;
    clearTimeout(tail.timer);
    tail.cues.release();
  }

  function clearPausedBedTimer() {
    if (pausedBedTimer.current) clearTimeout(pausedBedTimer.current);
    pausedBedTimer.current = null;
  }

  /**
   * The end of a session's audio (REVIEW_V3 #1): the keep-alive bed stops now; the cue players and the background
   * audio session go once the end tone has had time to finish. Then nothing keeps the app running in the background.
   */
  function releaseSessionAudio(tailMs: number) {
    clearPausedBedTimer();
    const cues = cuesRef.current;
    cuesRef.current = null;
    if (!cues) return;
    cues.stopAmbient();
    flushAudioTail();
    const finish = () => {
      if (audioTail.current?.cues === cues) audioTail.current = null;
      cues.release();
      endBackgroundAudio();
    };
    if (tailMs <= 0) finish();
    else audioTail.current = { cues, timer: setTimeout(finish, tailMs) };
  }

  function animateOrbForPhase(pattern: Pattern, event: SessionPhaseEvent) {
    const { phase, phaseElapsedMs } = event;
    if (phase.kind === 'hold') {
      // Normally a hold leaves the orb where it is; after a crash recovery it must be put there.
      if (phaseElapsedMs > 0) orbScale.value = holdScale(pattern, event.phaseIndex);
      return;
    }
    const target = phase.kind === 'exhale' ? ORB_SMALL : ORB_BIG;
    const totalMs = phase.seconds * 1000;
    if (phaseElapsedMs > 0) {
      const from = phase.kind === 'exhale' ? ORB_BIG : ORB_SMALL;
      orbScale.value = from + (target - from) * Math.min(1, phaseElapsedMs / totalMs);
    }
    orbScale.value = withTiming(target, { duration: Math.max(0, totalMs - phaseElapsedMs), easing: Easing.inOut(Easing.quad) });
  }

  function clearPrep() {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = null;
    if (prepInterval.current) clearInterval(prepInterval.current);
    prepInterval.current = null;
    setPrepLeft(null);
  }

  /** Home -> (optional get-ready countdown) -> breathing. Remembers this pattern + target as the default. */
  /** The SessionCues for a JS-guided session (null when nothing plays): v1 path, and the iOS locked-mode bed (D11). */
  function createSessionCues(current: AppSettings, pattern: Pattern): SessionCues | null {
    // Audio is the mechanism that keeps the app alive when locked (D11), so "keep guiding when
    // locked" needs cues preloaded even if the separate "Sound" toggle is off. With the native runner
    // (Android) JS plays nothing: the runner plays tones and haptics itself.
    if (!current.sound && !current.lockGuidance) return null;
    const cues = new SessionCues();
    cues.preload(current.volume, current.endSound);
    if (current.lockGuidance) {
      setBackgroundAudioMode().catch(() => {});
      // iOS: an incoming call stops the bed -> pause the session, no auto-resume (D39).
      cues.startAmbient(
        'Breathe Well',
        pattern.name,
        Platform.OS === 'ios' ? () => externalActionRef.current({ action: 'pause', elapsedMs: 0 }) : undefined
      );
    } else {
      setForegroundAudioMode().catch(() => {});
    }
    return cues;
  }

  /**
   * "Keep guiding when locked" with a get-ready countdown (REVIEW_V3 #5): arm the guidance at the tap, so locking the
   * phone during the countdown still starts the session on time. Android: the native runner starts now with the
   * countdown as a lead-in (its clock starts below zero). iOS: the keep-alive bed starts now, so the app's timers keep
   * running while locked.
   */
  function prestartGuidance(current: AppSettings, pattern: Pattern, target: SessionTarget, prepMs: number) {
    const startAt = Date.now() + prepMs;
    const runner = nativeRunnerFor(true);
    if (runner) {
      const preview = new SessionEngine({ pattern, target });
      runner.start(preview.cueSchedule(0), runnerOptions(current, pattern, -prepMs, preview.displayEnd));
      prestartRef.current = { startAt, runner: true };
      return;
    }
    flushAudioTail();
    clearPausedBedTimer();
    cuesRef.current?.release();
    cuesRef.current = createSessionCues(current, pattern);
    prestartRef.current = { startAt, runner: false };
  }

  function runnerOptions(current: AppSettings, pattern: Pattern, elapsedMs: number, displayEndMs: number | null) {
    return {
      title: pattern.name,
      elapsedMs,
      displayEndMs,
      // v1 rule kept: locked mode always plays tones (they are the guidance with the screen off).
      sound: current.sound || current.lockGuidance,
      haptics: current.haptics,
      hapticStrength: current.hapticStrength,
      volume: current.volume,
      endSound: current.endSound,
      endCueMinMs: MIN_SAVED_SESSION_SECONDS * 1000,
    };
  }

  function startSession(base: AppSettings | null = settings, pattern: Pattern = patternRef.current, target: SessionTarget = targetRef.current) {
    if (screenPhaseRef.current !== 'idle' || !base) return;
    restartCountdownRef.current = null;
    patternRef.current = pattern;
    targetRef.current = target;
    setSettings({ ...base, patternId: pattern.id, target });
    // The pattern's own haptics / sound / fade choices win over the global ones for this session.
    const current = applyPatternPrefs(base, prefsRef.current?.patternId === pattern.id ? prefsRef.current : null);
    setLive(current);
    if (recoverable) {
      // Starting fresh replaces an unfinished session: its guided part is saved as partial, not thrown away (REVIEW_V3 #15).
      const outcome = savedOutcome(recoverable, Date.now());
      if (outcome.status === 'finished') saveRecovered(recoverable, outcome, base);
      setRecoverable(null);
      persistActive(null);
    }

    const prepMs = current.prepSeconds > 0 ? current.prepSeconds * 1000 : SETTLE_MS;
    changeScreenPhase('settling');
    settleArgsRef.current = { base, pattern, target };
    guidesInBackground.current = current.lockGuidance;
    // Load the native runner's tones during the settle so the first cue is ready.
    nativeRunnerFor(current.lockGuidance)?.prepare();
    if (current.lockGuidance) prestartGuidance(current, pattern, target, prepMs);
    orbOpacity.value = 0;
    orbOpacity.value = withTiming(1, { duration: SETTLE_MS });
    if (current.prepSeconds > 0) {
      const deadline = Date.now() + prepMs;
      setPrepLeft(current.prepSeconds);
      prepInterval.current = setInterval(() => setPrepLeft(Math.max(1, Math.ceil((deadline - Date.now()) / 1000))), 250);
    }
    settleTimer.current = setTimeout(() => {
      clearPrep();
      // "Repeat last session": the next launch offers the same pattern and target, and Recent lists it.
      setPattern(db, pattern.id)
        .then(() => setTarget(db, target))
        .then(() => touchPatternUsed(db, pattern.id))
        .catch(() => {});
      // With guidance armed at the tap, the session started at startAt even if this timer fires late (Android
      // freezes JS timers while locked; the runner has been guiding since).
      const pre = prestartRef.current;
      prestartRef.current = null;
      beginEngine(current, pattern, target, pre ? Math.max(0, Date.now() - pre.startAt) : 0, pre ? pre.startAt : Date.now(), pre);
    }, prepMs);
  }

  function cancelPrep() {
    const pre = prestartRef.current;
    prestartRef.current = null;
    if (pre?.runner) nativeRunnerFor(true)?.stop();
    else if (pre) releaseSessionAudio(0);
    clearPrep();
    setLive(null);
    orbOpacity.value = 1;
    changeScreenPhase('idle');
  }

  /** pre: guidance already armed during the countdown (prestartGuidance); its runner / cues are kept. */
  function beginEngine(
    current: AppSettings,
    pattern: Pattern,
    target: SessionTarget,
    fromMs: number,
    startedAt: number,
    pre: { runner: boolean } | null = null
  ) {
    if (__DEV__) console.log('[haptics] capabilities', hapticCapabilities());

    flushAudioTail();
    clearPausedBedTimer();
    const keepCues = pre !== null && !pre.runner && cuesRef.current !== null;
    if (!keepCues) {
      cuesRef.current?.release();
      cuesRef.current = null;
    }
    const runner = nativeRunnerFor(current.lockGuidance);
    runnerRef.current = runner;
    if (!runner && !keepCues) cuesRef.current = createSessionCues(current, pattern);

    const engine = new SessionEngine({
      pattern,
      target,
      onPhaseStart: (event) => {
        setCurrentPhaseEvent(event);
        animateOrbForPhase(pattern, event);
        // A phase joined part-way (crash recovery) does not replay its cue.
        const joinedLate = event.phaseElapsedMs > 500;
        if (!joinedLate) cuesRef.current?.play(cueForPhase(event.phase.kind));
        confirmGuided(event.offsetMs + event.phaseElapsedMs);
        if (__DEV__ && sessionStartWallClock.current != null && !joinedLate) {
          const jitterMs = Date.now() - sessionStartWallClock.current - event.offsetMs;
          console.log('[timing] phase', event.phase.kind, 'nominalOffsetMs', event.offsetMs, 'jitterMs', jitterMs);
        }

        if (holdTickTimer.current) {
          clearTimeout(holdTickTimer.current);
          holdTickTimer.current = null;
        }
        if (runner) return; // the native runner plays this cue's haptics (and hold ticks) itself
        const haptics = current.haptics;
        const strength = current.hapticStrength;
        if (event.phase.kind === 'hold') {
          if (!joinedLate) playHoldTick('start', haptics, strength);
          const untilEndMs = event.phase.seconds * 1000 - 1000 - event.phaseElapsedMs;
          if (untilEndMs > 300) {
            holdTickTimer.current = setTimeout(() => playHoldTick('end', haptics, strength), untilEndMs);
          }
        } else if (!joinedLate) {
          playPhaseHaptic(event.phase.kind, event.phase.seconds * 1000, haptics, strength);
        }
      },
      onTick: (event) => {
        setElapsedMs(event.elapsedMs);
        setRemainingMs(event.remainingMs);
      },
      onEnd: (event) => handleEnd(current, pattern, target, event),
    });
    engineRef.current = engine;
    liveActivityOn.current = Platform.OS === 'ios' && current.liveActivity;
    setFinishing(false);
    changeScreenPhase('running');
    persistActive({
      patternId: pattern.id,
      patternName: pattern.name,
      phases: [...pattern.phases],
      target: serializeTarget(target),
      startedAt,
      startTime: Date.now() - fromMs,
      pausedElapsedMs: null,
      pausedAt: null,
      guidedMs: fromMs,
      guidedAt: Date.now(),
    });
    lastGuidedWrite.current = Date.now();
    guidesInBackground.current = current.lockGuidance;
    if (!pre?.runner) runner?.start(engine.cueSchedule(fromMs), runnerOptions(current, pattern, fromMs, engine.displayEnd));
    sessionStartWallClock.current = Date.now() - fromMs;
    engine.start(fromMs);
  }

  function handleEnd(current: AppSettings, pattern: Pattern, target: SessionTarget, event: SessionEndEvent) {
    engineRef.current = null;
    const runner = runnerRef.current;
    runnerRef.current = null;
    if (holdTickTimer.current) {
      clearTimeout(holdTickTimer.current);
      holdTickTimer.current = null;
    }
    if (runner) {
      // Plays the end cue unless it already did at the scheduled end, then stops its service.
      // (No stopHaptics here: it would cut the runner's end chime.)
      runner.end(event.actualSeconds >= MIN_SAVED_SESSION_SECONDS);
    } else {
      cuesRef.current?.stopAll();
      stopHaptics();
    }
    const startedAt = activeRef.current?.startedAt ?? Date.now() - event.actualSeconds * 1000;
    persistActive(null);
    recordSession(
      db,
      {
        patternName: pattern.name,
        patternId: pattern.id,
        target,
        phases: pattern.phases,
        plannedSeconds: targetPlannedSeconds(pattern, target),
        actualSeconds: event.actualSeconds,
        breaths: event.breaths,
        completed: event.completed,
        moodBefore: moodBeforeRef.current,
      },
      startedAt
    )
      .then((id) => {
        setEndedSessionId(id);
        if (id !== null) {
          syncSessionsToHealthIfOn(db, current);
          publishTodayMinutes(db);
        }
      })
      .catch(() => {});

    if (event.actualSeconds < MIN_SAVED_SESSION_SECONDS) {
      releaseSessionAudio(0);
      resetToIdle();
      return;
    }
    if (!runner) {
      cuesRef.current?.play('end');
      playEndHaptic(current.haptics, current.hapticStrength);
    }
    releaseSessionAudio(END_TONE_TAIL_MS);
    setMoodAfter(null);
    setEndedSessionId(null);
    setSummary(event);
    changeScreenPhase('ended');
  }

  function chooseMoodBefore(value: number | null) {
    moodBeforeRef.current = value;
    setMoodBeforeState(value);
  }

  function chooseMoodAfter(value: number | null) {
    if (endedSessionId === null) return;
    setMoodAfter(value);
    setSessionMood(db, endedSessionId, 'after', value).catch(() => {});
  }

  function resetToIdle() {
    releaseSessionAudio(0);
    chooseMoodBefore(null);
    setMoodAfter(null);
    setEndedSessionId(null);
    changeScreenPhase('idle');
    setCurrentPhaseEvent(null);
    setRemainingMs(null);
    setElapsedMs(0);
    setSummary(null);
    setFinishing(false);
    setLive(null);
    orbScale.value = 1;
    orbOpacity.value = 1;
    loadHome().catch(() => {});
  }

  /** Continues an unfinished session found at launch, from where it would be by now. */
  function resumeRecovered() {
    if (!recoverable || !settings || screenPhaseRef.current !== 'idle') return;
    const outcome = evaluateActiveSession(recoverable, Date.now());
    const target = parseTarget(recoverable.target);
    if (outcome.status !== 'resume' || !target) {
      setRecoverable(null);
      loadHome().catch(() => {});
      return;
    }
    const pattern = patternFromPhases(recoverable.patternId, recoverable.patternName, recoverable.phases);
    patternRef.current = pattern;
    targetRef.current = target;
    setRecoverable(null);
    orbOpacity.value = 1;
    const effective = applyPatternPrefs(settings, prefsRef.current?.patternId === pattern.id ? prefsRef.current : null);
    setLive(effective);
    beginEngine(effective, pattern, target, outcome.elapsedMs, recoverable.startedAt);
  }

  function handleScreenTap() {
    if (screenPhase === 'settling') {
      cancelPrep();
      return;
    }
    if (screenPhase !== 'running') return;
    if (dimmed) {
      poke();
      return;
    }
    pauseSession(false);
  }

  /** fromOutside: the runner (notification, headset, call) already paused itself. */
  function pauseSession(fromOutside: boolean) {
    const engine = engineRef.current;
    if (!engine || screenPhaseRef.current !== 'running') return;
    cancelAnimation(orbScale);
    engine.pause();
    if (!fromOutside) runnerRef.current?.pause();
    if (activeRef.current) {
      persistActive({ ...activeRef.current, pausedElapsedMs: engine.getElapsedMs(), pausedAt: Date.now() });
    }
    if (holdTickTimer.current) {
      clearTimeout(holdTickTimer.current);
      holdTickTimer.current = null;
    }
    cuesRef.current?.stopAll();
    stopHaptics();
    // iOS locked mode: a long pause must not keep the app running in the background (REVIEW_V3 #1). Resume restarts the bed.
    clearPausedBedTimer();
    if (cuesRef.current?.hasAmbient) {
      pausedBedTimer.current = setTimeout(() => {
        pausedBedTimer.current = null;
        cuesRef.current?.stopAmbient();
        endBackgroundAudio();
      }, PAUSED_BED_MS);
    }
    changeScreenPhase('paused');
  }

  function handleResume() {
    resumeSession(false);
  }

  function resumeSession(fromOutside: boolean) {
    const engine = engineRef.current;
    if (!engine || !currentPhaseEvent || screenPhaseRef.current !== 'paused') return;
    engine.resume();
    if (!fromOutside) runnerRef.current?.resume(engine.getElapsedMs());
    clearPausedBedTimer();
    cuesRef.current?.resumeAmbient();
    if (activeRef.current) {
      persistActive({
        ...activeRef.current,
        startTime: Date.now() - engine.getElapsedMs(),
        pausedElapsedMs: null,
        pausedAt: null,
        guidedMs: engine.getElapsedMs(),
        guidedAt: Date.now(),
      });
    }
    changeScreenPhase('running');
    poke();
    const remainingPhaseMs = currentPhaseEvent.phase.seconds * 1000 - (engine.getElapsedMs() - currentPhaseEvent.offsetMs);
    if (remainingPhaseMs > 0 && currentPhaseEvent.phase.kind !== 'hold') {
      const target = currentPhaseEvent.phase.kind === 'exhale' ? ORB_SMALL : ORB_BIG;
      orbScale.value = withTiming(target, { duration: remainingPhaseMs, easing: Easing.inOut(Easing.quad) });
    }
  }

  function handleEndButton() {
    engineRef.current?.end();
  }

  function handleEndAfterBreath() {
    const engine = engineRef.current;
    if (!engine) return;
    engine.finishAfterCycle();
    runnerRef.current?.update(engine.cueSchedule(engine.getElapsedMs()), engine.displayEnd);
    setFinishing(true);
    handleResume();
  }

  // The 'text' visual: the phase word itself grows and shrinks with the breath (or cross-fades).
  const wordStyle = useAnimatedStyle(() =>
    reduceMotion
      ? { transform: [{ scale: 1 }], opacity: orbOpacity.value * (0.3 + 0.7 * breathProgress(orbScale.value)) }
      : { transform: [{ scale: orbScale.value }], opacity: orbOpacity.value }
  );
  const contentStyle = useAnimatedStyle(() => ({ opacity: contentOpacity.value }));

  const visual = view?.visual ?? 'orb';
  const largeText = view?.textScale === 'large';
  const showHomeChrome = screenPhase === 'idle';
  const showPhaseInfo = screenPhase === 'running' || screenPhase === 'paused';

  if (screenPhase === 'ended' && summary) {
    return (
      <View testID="end-screen" style={[styles.container, styles.endContainer, { backgroundColor: theme.background }]}>
        <ThemedText type="title" style={styles.endTitle}>
          {formatSessionSummary(summary.actualSeconds, summary.breaths)}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.endPattern}>
          {patternRef.current.name}
        </ThemedText>
        {settings?.moodCheckin && (
          <View style={styles.moodBlock}>
            <MoodRow label="How do you feel now? (optional)" value={moodAfter} onChange={chooseMoodAfter} testIdPrefix="mood-after" />
          </View>
        )}
        <Pressable testID="done" accessibilityRole="button" onPress={resetToIdle} style={[styles.doneButton, { backgroundColor: theme.tint }]}>
          <ThemedText style={{ color: theme.onTint }} type="smallBold">
            Done
          </ThemedText>
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      testID="home-screen"
      accessible={false}
      style={[styles.container, { backgroundColor: dimmed ? '#000000' : theme.background }]}
      onPress={handleScreenTap}>
      <Animated.View style={[styles.content, contentStyle, styles.contentColumn, { paddingTop: insets.top + Spacing.two, paddingBottom: insets.bottom + Spacing.two }]}>
        {showHomeChrome && (
          <Link href="/settings" asChild>
            <Pressable testID="open-settings" accessibilityLabel="Settings" hitSlop={12} style={styles.settingsButton}>
              <ThemedText themeColor="tint">Settings</ThemedText>
            </Pressable>
          </Link>
        )}

        <View style={styles.center}>
          <Pressable testID="start" disabled={screenPhase !== 'idle'} onPress={() => startSession()} hitSlop={20}>
            {visual === 'text' ? (
              <Animated.View testID="orb" style={[styles.wordBox, wordStyle]}>
                <ThemedText
                  testID={showPhaseInfo && currentPhaseEvent ? 'phase-label' : undefined}
                  type="title"
                  maxFontSizeMultiplier={1.4}
                  style={[styles.word, largeText && styles.wordLarge]}>
                  {showPhaseInfo && currentPhaseEvent ? phaseWord(currentPhaseEvent.phase.kind) : screenPhase === 'idle' ? 'Begin' : ''}
                </ThemedText>
              </Animated.View>
            ) : (
              <BreathVisual
                kind={visual}
                scale={orbScale}
                opacity={orbOpacity}
                color={theme.tint}
                trackColor={theme.backgroundSelected}
                reduceMotion={reduceMotion}
                resting={screenPhase === 'idle'}
              />
            )}
          </Pressable>

          {screenPhase === 'settling' && prepLeft != null && (
            <ThemedText testID="prep-count" type="title" style={styles.phaseLabel}>
              {prepLeft}
            </ThemedText>
          )}

          {showPhaseInfo && currentPhaseEvent && (
            <>
              {visual !== 'text' && (
                <ThemedText
                  testID="phase-label"
                  type="title"
                  maxFontSizeMultiplier={1.4}
                  style={[styles.phaseLabel, largeText && styles.phaseLabelLarge]}>
                  {phaseWord(currentPhaseEvent.phase.kind)}
                </ThemedText>
              )}
              <ThemedText testID="remaining" themeColor="textSecondary" style={styles.remaining}>
                {remainingMs != null ? formatClock(remainingMs) : formatClock(elapsedMs)}
              </ThemedText>
              {finishing && (
                <ThemedText testID="ending-note" type="small" themeColor="textSecondary">
                  Ending after this breath
                </ThemedText>
              )}
            </>
          )}
        </View>

        {showHomeChrome && settings && (
          <View style={styles.footer}>
            {recoverable && (
              <Pressable testID="resume-session" accessibilityRole="button" onPress={resumeRecovered} hitSlop={12}>
                <ThemedText type="smallBold" themeColor="tint">
                  Resume your session
                </ThemedText>
              </Pressable>
            )}
            {settings.moodCheckin && <MoodRow label="How are you feeling? (optional)" value={moodBefore} onChange={chooseMoodBefore} testIdPrefix="mood-before" />}
            <Pressable testID="pattern-line" onPress={() => router.push('/patterns')} hitSlop={12}>
              <ThemedText type="smallBold">
                {patternRef.current.name} · {targetLabel(settings.target)}
              </ThemedText>
            </Pressable>
            {!settings.hasSeenFirstRun && (
              <ThemedText themeColor="textSecondary" type="small" style={styles.firstRun}>
                For relaxation only · stop if you feel dizzy ·{' '}
                <Link href="/about">
                  <ThemedText type="small" themeColor="tint">
                    Details
                  </ThemedText>
                </Link>
              </ThemedText>
            )}
          </View>
        )}

        {screenPhase === 'paused' && (
          <View style={styles.pausedBlock}>
            <View style={styles.pausedButtons}>
              <Pressable testID="resume" accessibilityRole="button" onPress={handleResume} style={[styles.pauseButton, { backgroundColor: theme.tint }]}>
                <ThemedText style={{ color: theme.onTint }} type="smallBold">
                  Resume
                </ThemedText>
              </Pressable>
              <Pressable testID="end" accessibilityRole="button" onPress={handleEndButton} style={[styles.pauseButton, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="smallBold">End</ThemedText>
              </Pressable>
            </View>
            {!finishing && (
              <Pressable testID="end-after-breath" accessibilityRole="button" onPress={handleEndAfterBreath} hitSlop={12}>
                <ThemedText type="smallBold" themeColor="tint">
                  End after this breath
                </ThemedText>
              </Pressable>
            )}
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  endContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  moodBlock: {
    marginTop: Spacing.four,
  },
  content: {
    flex: 1,
    padding: Spacing.four,
  },
  // Tablets and foldables: a centred column instead of a stretched phone layout.
  contentColumn: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  settingsButton: {
    alignSelf: 'flex-end',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  phaseLabel: {
    marginTop: Spacing.two,
  },
  phaseLabelLarge: {
    fontSize: 72,
    lineHeight: 80,
  },
  wordBox: {
    minHeight: 220,
    minWidth: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  word: {
    fontSize: 64,
    lineHeight: 72,
    textAlign: 'center',
  },
  wordLarge: {
    fontSize: 88,
    lineHeight: 96,
  },
  remaining: {
    fontSize: 18,
  },
  footer: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingBottom: Spacing.four,
  },
  firstRun: {
    textAlign: 'center',
    paddingHorizontal: Spacing.four,
  },
  pausedBlock: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingBottom: Spacing.five,
  },
  pausedButtons: {
    flexDirection: 'row',
    gap: Spacing.three,
    justifyContent: 'center',
  },
  pauseButton: {
    minWidth: 120,
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endTitle: {
    textAlign: 'center',
  },
  endPattern: {
    textAlign: 'center',
    marginTop: Spacing.two,
  },
  doneButton: {
    marginTop: Spacing.six,
    minWidth: 160,
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
});
