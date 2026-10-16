package expo.modules.sessionrunner

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.SoundPool
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import java.util.concurrent.Executor

/** One cue from the JS `buildSchedule` list: offsets are ms since session start, excluding paused time. */
data class Cue(val atMs: Long, val kind: String, val durationMs: Long)

data class RunnerSettings(
  val title: String,
  /** Countdown end shown in the media controls; null for Open sessions. */
  val displayEndMs: Long?,
  val sound: Boolean,
  /** "off" | "on" */
  val haptics: String,
  /** Haptic strength 0.1-1.0 (the app's slider). */
  val strength: Double,
  /** Cue volume 0.0-1.0 (the app's slider). */
  val volume: Float,
  /** "chime" | "bell" | "bowl" | "none": which tone marks the end. */
  val endSound: String,
  /** An End from the notification plays the end cue only past this (the app's "saved session" minimum). */
  val endCueMinMs: Long,
)

data class RunnerSnapshot(
  val active: Boolean,
  val paused: Boolean,
  val title: String,
  val displayEndMs: Long?,
  val elapsedMs: Long,
)

/**
 * Owns every cue (tone + vibration) of a "Keep guiding when locked" session on Android (V3_PLAN P2,
 * DECISIONS D39). React Native's Android timers stop while the screen is off, so JS only draws; this
 * object plays the cue list JS built with `buildSchedule` (one source of truth, D12) from a
 * HandlerThread, timed against SystemClock.elapsedRealtime(), with a PARTIAL_WAKE_LOCK held while
 * running. SessionService hosts the media session/notification; both live in the app's process.
 *
 * Threading: all session state is written on the runner thread only; other threads read the
 * @Volatile fields (snapshot()) or post work to the runner thread.
 */
object SessionRunnerCore {
  const val TAG = "SessionRunner"
  private const val END_SHUTDOWN_DELAY_MS = 4500L // the bowl rings ~4 s
  private const val WAKE_LOCK_SLACK_MS = 60_000L
  private const val SERVICE_STOP_DELAY_MS = 500L
  private val CUE_TOKEN = Any()
  private val HOLD_TOKEN = Any()

  fun interface ActionListener {
    fun onAction(action: String, elapsedMs: Long)
  }

  /** Set by the Expo module: forwards pause/resume/end that did not come from the app itself. */
  @Volatile var actionListener: ActionListener? = null

  private var thread: HandlerThread? = null
  private var handler: Handler? = null
  private val mainHandler = Handler(Looper.getMainLooper())
  private var appContext: Context? = null

  private var soundPool: SoundPool? = null
  private val soundIds = HashMap<String, Int>()
  private val loadedIds = HashSet<Int>()
  private var ambientStream = 0
  private var wakeLock: PowerManager.WakeLock? = null
  private var haptics: CueHaptics? = null
  private var modeListener: Any? = null
  private var noisyReceiver: BroadcastReceiver? = null

  @Volatile private var service: SessionService? = null
  @Volatile private var player: SessionPlayer? = null

  // Session state (runner thread writes).
  private var cues: List<Cue> = emptyList()
  private var nextIndex = 0
  private var generation = 0
  private var settings = RunnerSettings("", null, true, "on", 0.45, 1f, "chime", 0)
  private var endPlayed = false
  private var cueCount = 0
  @Volatile private var baseRealtime = 0L
  @Volatile private var pausedElapsed = 0L
  @Volatile var active = false
    private set
  @Volatile private var paused = false
  @Volatile private var title = ""
  @Volatile private var displayEndMs: Long? = null

  private fun now() = SystemClock.elapsedRealtime()

  private fun elapsed(): Long = if (paused) pausedElapsed else now() - baseRealtime

  // Clamped: during a get-ready countdown started with the runner (v3.1 F4) the session clock is still below 0.
  fun snapshot(): RunnerSnapshot =
    RunnerSnapshot(active, paused, title, displayEndMs, if (active) maxOf(0L, elapsed()) else 0L)

  @Synchronized
  private fun runner(context: Context): Handler {
    appContext = context.applicationContext
    handler?.let { return it }
    val t = HandlerThread("SessionRunner", android.os.Process.THREAD_PRIORITY_URGENT_AUDIO)
    t.start()
    thread = t
    return Handler(t.looper).also { handler = it }
  }

  private fun post(context: Context?, block: () -> Unit) {
    val h = if (context != null) runner(context) else handler
    h?.post(block)
  }

  /** Loads the tones ahead of the first cue (called while the app shows the get-ready settle). */
  fun prepare(context: Context) = post(context) { ensureSounds() }

  fun start(context: Context, newCues: List<Cue>, newSettings: RunnerSettings, elapsedMs: Long) = post(context) {
    ensureSounds()
    // A new session replaces any running one; the service and notification stay.
    handler?.removeCallbacksAndMessages(CUE_TOKEN)
    handler?.removeCallbacksAndMessages(HOLD_TOKEN)
    haptics?.cancel()
    stopAmbient()
    generation++
    cues = newCues
    settings = newSettings
    title = newSettings.title
    displayEndMs = newSettings.displayEndMs
    baseRealtime = now() - elapsedMs
    nextIndex = newCues.indexOfFirst { it.atMs >= elapsedMs }.let { if (it < 0) newCues.size else it }
    endPlayed = false
    cueCount = 0
    paused = false
    active = true
    acquireWakeLock()
    startAmbient()
    registerCallListener()
    registerNoisyReceiver()
    ensureService()
    Log.i(TAG, "start cues=${newCues.size} elapsedMs=$elapsedMs endMs=${newCues.lastOrNull()?.atMs} sound=${newSettings.sound} haptics=${newSettings.haptics} strength=${newSettings.strength} volume=${newSettings.volume} endSound=${newSettings.endSound}")
    notifyPlayer()
    scheduleNext()
  }

  /** New cue list for the running session ("End after this breath" moved the end). */
  fun update(newCues: List<Cue>, newDisplayEndMs: Long?) = post(null) {
    if (!active) return@post
    cues = newCues
    displayEndMs = newDisplayEndMs
    val e = elapsed()
    nextIndex = newCues.indexOfFirst { it.atMs >= e }.let { if (it < 0) newCues.size else it }
    Log.i(TAG, "update cues=${newCues.size} fromMs=$e endMs=${newCues.lastOrNull()?.atMs}")
    if (!paused) {
      acquireWakeLock()
      scheduleNext()
    }
    notifyPlayer()
  }

  fun pause(source: String) = post(null) {
    if (!active || paused) return@post
    pausedElapsed = now() - baseRealtime
    paused = true
    handler?.removeCallbacksAndMessages(CUE_TOKEN)
    handler?.removeCallbacksAndMessages(HOLD_TOKEN)
    haptics?.cancel()
    soundPool?.autoPause()
    stopAmbient()
    releaseWakeLock()
    Log.i(TAG, "pause source=$source elapsedMs=$pausedElapsed")
    notifyPlayer()
    if (source != "app") actionListener?.onAction("pause", pausedElapsed)
  }

  /** elapsedMs: the app's own clock, so both schedulers agree after every resume; null keeps ours. */
  fun resume(source: String, elapsedMs: Long?) = post(null) {
    if (!active || !paused) return@post
    val e = elapsedMs ?: pausedElapsed
    baseRealtime = now() - e
    paused = false
    while (nextIndex < cues.size && cues[nextIndex].atMs < e) nextIndex++
    acquireWakeLock()
    startAmbient()
    ensureService()
    Log.i(TAG, "resume source=$source elapsedMs=$e")
    notifyPlayer()
    scheduleNext()
    if (source != "app") actionListener?.onAction("resume", e)
  }

  /**
   * Ends the session. playCue null = decide by length (notification End); the app passes its own
   * decision. Sources other than "app" are reported to JS so it records the session.
   */
  fun end(source: String, playCue: Boolean?) = post(null) {
    if (!active) return@post
    val e = elapsed()
    val cue = (playCue ?: (e >= settings.endCueMinMs)) && !endPlayed && source != "task"
    if (cue) playCue(Cue(e, "end", 0))
    Log.i(TAG, "end source=$source elapsedMs=$e endCue=$cue")
    stopEverything(immediate = !cue && !endPlayed)
    if (source != "app") actionListener?.onAction("end", e)
  }

  // --- scheduling -------------------------------------------------------------------------------

  private fun scheduleNext() {
    val h = handler ?: return
    h.removeCallbacksAndMessages(CUE_TOKEN)
    if (!active || paused || nextIndex >= cues.size) return
    val gen = generation
    val delay = baseRealtime + cues[nextIndex].atMs - now()
    h.postAtTime({ fireDue(gen) }, CUE_TOKEN, SystemClock.uptimeMillis() + maxOf(0L, delay))
  }

  private fun fireDue(gen: Int) {
    if (gen != generation || !active || paused || nextIndex >= cues.size) return
    val t = now()
    // Handler delays count uptime, which stops in deep sleep; re-check against the real clock.
    if (t < baseRealtime + cues[nextIndex].atMs - 1) {
      scheduleNext()
      return
    }
    // If the thread was held up past the following cue too, play only the latest due one (never a burst).
    while (nextIndex + 1 < cues.size && baseRealtime + cues[nextIndex + 1].atMs <= t) {
      Log.w(TAG, "skip kind=${cues[nextIndex].kind} nominalMs=${cues[nextIndex].atMs} lateMs=${t - baseRealtime - cues[nextIndex].atMs}")
      nextIndex++
    }
    val cue = cues[nextIndex]
    nextIndex++
    playCue(cue)
    cueCount++
    val late = t - baseRealtime - cue.atMs
    Log.i(TAG, "cue n=$cueCount kind=${cue.kind} nominalMs=${cue.atMs} lateMs=$late screenOn=${screenOn()}")
    if (cue.kind == "hold" && cue.durationMs - 1000 > 300) {
      // The lighter tick ~1 s before a hold ends (SPEC), derived from the same cue.
      val at = cue.atMs + cue.durationMs - 1000
      handler?.postAtTime({
        if (gen == generation && active && !paused) haptics?.holdEnd(settings.haptics, settings.strength)
      }, HOLD_TOKEN, SystemClock.uptimeMillis() + maxOf(0L, baseRealtime + at - now()))
    }
    if (cue.kind == "end") {
      Log.i(TAG, "finished elapsedMs=${cue.atMs}")
      stopEverything(immediate = false)
      return
    }
    if (nextIndex >= cues.size) {
      // A list without an end cue ran out (never expected: Open sessions now end at 2 h with an end cue, v3.1 F4).
      // End after this last phase rather than keep the notification, wake lock and service going silently.
      handler?.postAtTime({
        if (gen == generation && active && !paused) end("exhausted", true)
      }, CUE_TOKEN, SystemClock.uptimeMillis() + maxOf(0L, baseRealtime + cue.atMs + cue.durationMs - now()))
      return
    }
    scheduleNext()
  }

  private fun playCue(cue: Cue) {
    if (cue.kind == "end") endPlayed = true
    val key = when (cue.kind) {
      "inhale", "exhale", "sip" -> cue.kind
      // The end tone is the one the user picked ("chime" is the v1 three-note tone, stored as "end").
      "end" -> when (settings.endSound) {
        "bell" -> "bell"
        "bowl" -> "bowl"
        "none" -> null
        else -> "end"
      }
      else -> "hold"
    }
    if (settings.sound && key != null) {
      val id = soundIds[key]
      if (id != null && loadedIds.contains(id)) {
        soundPool?.play(id, settings.volume, settings.volume, 1, 0, 1f)
      } else {
        Log.w(TAG, "sound not ready kind=$key")
      }
    }
    haptics?.play(cue.kind, cue.durationMs, settings.haptics, settings.strength)
  }

  private fun stopEverything(immediate: Boolean) {
    val gen = ++generation
    handler?.removeCallbacksAndMessages(CUE_TOKEN)
    handler?.removeCallbacksAndMessages(HOLD_TOKEN)
    if (immediate) haptics?.cancel()
    stopAmbient()
    unregisterCallListener()
    unregisterNoisyReceiver()
    active = false
    paused = false
    notifyPlayer()
    val finish = {
      if (gen == generation) {
        releaseWakeLock()
        // Give media3 a moment to process the ended state first: stopping mid-update let it restart
        // the service with startForegroundService and crash (ForegroundServiceDidNotStartInTime, D39).
        mainHandler.postDelayed({ if (!active) service?.stopSession() }, SERVICE_STOP_DELAY_MS)
      }
    }
    // Let the end tone and chime finish (the wake lock still holds) before letting go.
    if (immediate) finish() else handler?.postDelayed(finish, END_SHUTDOWN_DELAY_MS)
  }

  // --- audio, wake lock, calls --------------------------------------------------------------------

  private fun ensureSounds() {
    val context = appContext ?: return
    if (haptics == null) haptics = CueHaptics(context)
    if (soundPool != null) return
    val pool = SoundPool.Builder()
      .setMaxStreams(4)
      .setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_MEDIA)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
      )
      .build()
    pool.setOnLoadCompleteListener { _, sampleId, status ->
      // Called on the runner thread's looper (the pool was created there).
      if (status == 0) loadedIds.add(sampleId)
    }
    soundPool = pool
    soundIds["inhale"] = pool.load(context, R.raw.sr_inhale, 1)
    soundIds["exhale"] = pool.load(context, R.raw.sr_exhale, 1)
    soundIds["hold"] = pool.load(context, R.raw.sr_hold, 1)
    soundIds["sip"] = pool.load(context, R.raw.sr_sip, 1)
    soundIds["end"] = pool.load(context, R.raw.sr_end, 1)
    soundIds["bell"] = pool.load(context, R.raw.sr_bell, 1)
    soundIds["bowl"] = pool.load(context, R.raw.sr_bowl, 1)
    soundIds["ambient"] = pool.load(context, R.raw.sr_ambient, 1)
  }

  /** Near-silent loop: real media playback keeps the mediaPlayback service honest and the CPU awake. */
  private fun startAmbient() {
    if (ambientStream != 0) return
    val id = soundIds["ambient"] ?: return
    if (!loadedIds.contains(id)) {
      // Loading takes a few ms; retry shortly rather than failing the session.
      val gen = generation
      handler?.postDelayed({ if (gen == generation && active && !paused) startAmbient() }, 200)
      return
    }
    ambientStream = soundPool?.play(id, 1f, 1f, 0, -1, 1f) ?: 0
  }

  private fun stopAmbient() {
    if (ambientStream != 0) soundPool?.stop(ambientStream)
    ambientStream = 0
  }

  private fun acquireWakeLock() {
    val context = appContext ?: return
    if (wakeLock == null) {
      val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "BreatheWell:SessionRunner").apply {
        setReferenceCounted(false)
      }
    }
    // Timeout = what is left of the cue list + slack, so a lost session can never pin the CPU.
    val remaining = maxOf(0L, (cues.lastOrNull()?.atMs ?: 0L) - elapsed())
    wakeLock?.acquire(remaining + WAKE_LOCK_SLACK_MS)
  }

  private fun releaseWakeLock() {
    wakeLock?.let { if (it.isHeld) it.release() }
  }

  private fun screenOn(): Boolean {
    val pm = appContext?.getSystemService(Context.POWER_SERVICE) as? PowerManager
    return pm?.isInteractive ?: true
  }

  /** Incoming or ongoing call -> pause; the user resumes (no auto-resume). API 31+, no permission. */
  private fun registerCallListener() {
    if (modeListener != null || Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
    val am = appContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
    val h = handler ?: return
    val listener = AudioManager.OnModeChangedListener { mode ->
      if (mode == AudioManager.MODE_RINGTONE || mode == AudioManager.MODE_IN_CALL || mode == AudioManager.MODE_IN_COMMUNICATION) {
        pause("interruption")
      }
    }
    am.addOnModeChangedListener(Executor { h.post(it) }, listener)
    modeListener = listener
  }

  private fun unregisterCallListener() {
    val listener = modeListener ?: return
    modeListener = null
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
    val am = appContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
    am.removeOnModeChangedListener(listener as AudioManager.OnModeChangedListener)
  }

  /**
   * Earbuds or Bluetooth headphones disconnect -> pause, like iPhone does (REVIEW_V3 #7): tones must not move to the
   * phone speaker at media volume. Reported to JS as a pause; the user resumes. ACTION_AUDIO_BECOMING_NOISY is a
   * system broadcast, so a not-exported receiver still gets it.
   */
  private fun registerNoisyReceiver() {
    if (noisyReceiver != null) return
    val context = appContext ?: return
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(c: Context?, intent: Intent?) {
        if (intent?.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) pause("noisy")
      }
    }
    val filter = IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        context.registerReceiver(receiver, filter, null, handler, Context.RECEIVER_NOT_EXPORTED)
      } else {
        context.registerReceiver(receiver, filter, null, handler)
      }
      noisyReceiver = receiver
    } catch (e: Exception) {
      Log.w(TAG, "could not watch for headphones unplugged: ${e.message}")
    }
  }

  private fun unregisterNoisyReceiver() {
    val receiver = noisyReceiver ?: return
    noisyReceiver = null
    runCatching { appContext?.unregisterReceiver(receiver) }
  }

  // --- service / media session -------------------------------------------------------------------

  private fun ensureService() {
    val context = appContext ?: return
    if (service != null) return
    try {
      // Started while the app is visible (Android 17 background-audio rules); media3 moves it to the
      // foreground itself once the session player reports playing.
      context.startService(Intent(context, SessionService::class.java))
    } catch (e: Exception) {
      Log.w(TAG, "could not start SessionService: ${e.message}")
    }
  }

  fun attachService(s: SessionService, p: SessionPlayer) {
    service = s
    player = p
    Log.i(TAG, "service attached active=$active")
    if (!active) mainHandler.postDelayed({ if (!active) s.stopSession() }, SERVICE_STOP_DELAY_MS)
  }

  fun detachService(s: SessionService) {
    if (service === s) {
      service = null
      player = null
    }
  }

  private fun notifyPlayer() {
    mainHandler.post { player?.refresh() }
  }
}
