package expo.modules.sessionrunner

import android.content.Context
import android.media.AudioAttributes
import android.os.Build
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

/**
 * Vibration for runner cues. The waveforms are the same as modules/haptic-pattern's
 * HapticPatternModule (50 ms-step amplitude ramp for inhale/exhale, short ticks for holds and sips,
 * three rising taps at the end); kept as a copy because local Expo modules cannot depend on each other
 * without cross-project Gradle wiring (D39). Without amplitude control inhale/exhale get one short
 * tap, matching the JS fallback in src/lib/haptics.ts.
 */
class CueHaptics(context: Context) {
  private val vibrator: Vibrator? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }

  fun play(kind: String, durationMs: Long, level: String, strength: Double) {
    if (level == "off" || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val v = vibrator ?: return
    val hasAmplitude = v.hasAmplitudeControl()
    val (low, high) = levels(strength)
    val effect = when (kind) {
      "inhale" -> if (hasAmplitude) ramp(low, high, minOf(durationMs, 30_000L)) else oneShot(40, high, false)
      "exhale" -> if (hasAmplitude) ramp(high, low, minOf(durationMs, 30_000L)) else oneShot(30, low, false)
      "sip" -> oneShot(60, high, hasAmplitude)
      "hold" -> oneShot(40, (low + high) / 2, hasAmplitude)
      "end" -> chime(low, high)
      else -> return
    }
    vibrate(v, effect)
  }

  /** The lighter tick ~1 s before a hold ends. */
  fun holdEnd(level: String, strength: Double) {
    if (level == "off" || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val v = vibrator ?: return
    vibrate(v, oneShot(30, levels(strength).first, v.hasAmplitudeControl()))
  }

  fun cancel() {
    vibrator?.cancel()
  }

  /** strength 0.1-1.0 -> (low, high) amplitude; the same mapping as modules/haptic-pattern. */
  private fun levels(strength: Double): Pair<Int, Int> {
    val s = strength.coerceIn(0.1, 1.0)
    return (20 + 40 * s).toInt() to (80 + 175 * s).toInt()
  }

  private fun vibrate(v: Vibrator, effect: VibrationEffect) {
    v.cancel()
    // Media usage: allowed from a mediaPlayback foreground service with the screen off (touch usage is not).
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      v.vibrate(effect, VibrationAttributes.createForUsage(VibrationAttributes.USAGE_MEDIA))
    } else {
      @Suppress("DEPRECATION")
      v.vibrate(effect, AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).build())
    }
  }

  private fun oneShot(ms: Long, amplitude: Int, hasAmplitude: Boolean): VibrationEffect {
    val amp = if (hasAmplitude) amplitude.coerceIn(1, 255) else VibrationEffect.DEFAULT_AMPLITUDE
    return VibrationEffect.createOneShot(ms, amp)
  }

  private fun ramp(fromAmp: Int, toAmp: Int, durationMs: Long): VibrationEffect {
    val stepMs = 50L
    val steps = maxOf(1, (durationMs / stepMs).toInt())
    val timings = LongArray(steps) { stepMs }
    val amplitudes = IntArray(steps) { i ->
      val t = i.toFloat() / (steps - 1).coerceAtLeast(1)
      (fromAmp + (toAmp - fromAmp) * t).toInt().coerceIn(1, 255)
    }
    return VibrationEffect.createWaveform(timings, amplitudes, -1)
  }

  private fun chime(low: Int, high: Int): VibrationEffect {
    val timings = longArrayOf(0, 60, 80, 60, 80, 60)
    val amplitudes = intArrayOf(0, low, 0, (low + high) / 2, 0, high)
    return VibrationEffect.createWaveform(timings, amplitudes, -1)
  }
}
