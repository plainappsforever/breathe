package expo.modules.hapticpattern

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Timed haptic ramps for the breathing session (DECISIONS D9). Inhale/exhale get a 50ms-step
// amplitude ramp via VibrationEffect.createWaveform; devices without amplitude control get an on/off
// waveform instead (capabilities().ramps reports false so the JS layer can fall back to plain taps
// for inhale/exhale specifically; short taps here work on any API 26+ device either way).
class HapticPatternModule : Module() {
  private val vibrator: Vibrator?
    get() {
      val context = appContext.reactContext ?: return null
      return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val manager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
        manager?.defaultVibrator
      } else {
        @Suppress("DEPRECATION")
        context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
      }
    }

  override fun definition() = ModuleDefinition {
    Name("HapticPattern")

    Function("capabilities") {
      mapOf("ramps" to (vibrator?.hasAmplitudeControl() ?: false))
    }

    Function("play") { kind: String, durationMs: Double, strength: Double ->
      play(kind, durationMs, strength)
    }

    Function("stop") {
      vibrator?.cancel()
    }
  }

  private fun play(kind: String, durationMs: Double, strength: Double) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val v = vibrator ?: return
    val hasAmplitude = v.hasAmplitudeControl()
    // strength 0.1-1.0 (the "Haptic strength" slider) -> amplitude range; 0.45 ~ v1 Gentle, 0.9 ~ v1 Strong.
    // Kept identical in modules/session-runner's CueHaptics.
    val s = strength.coerceIn(0.1, 1.0)
    val low = (20 + 40 * s).toInt()
    val high = (80 + 175 * s).toInt()

    val effect = when (kind) {
      "inhale" -> ramp(low, high, durationMs, hasAmplitude)
      "exhale" -> ramp(high, low, durationMs, hasAmplitude)
      "sip" -> oneShot(60, high, hasAmplitude)
      "holdStart" -> oneShot(40, (low + high) / 2, hasAmplitude)
      "holdEnd" -> oneShot(30, low, hasAmplitude)
      "end" -> chime(low, high)
      else -> return
    }
    v.cancel()
    v.vibrate(effect)
  }

  private fun oneShot(ms: Long, amplitude: Int, hasAmplitude: Boolean): VibrationEffect {
    val amp = if (hasAmplitude) amplitude.coerceIn(1, 255) else VibrationEffect.DEFAULT_AMPLITUDE
    return VibrationEffect.createOneShot(ms, amp)
  }

  /** 50ms-step amplitude ramp; falls back to an on/off waveform without amplitude control. */
  private fun ramp(fromAmp: Int, toAmp: Int, durationMs: Double, hasAmplitude: Boolean): VibrationEffect {
    val stepMs = 50L
    val steps = maxOf(1, (durationMs / stepMs).toInt())
    val timings = LongArray(steps) { stepMs }
    val amplitudes = IntArray(steps) { i ->
      if (!hasAmplitude) {
        if (i % 2 == 0) 255 else 0
      } else {
        val t = i.toFloat() / (steps - 1).coerceAtLeast(1)
        (fromAmp + (toAmp - fromAmp) * t).toInt().coerceIn(1, 255)
      }
    }
    return VibrationEffect.createWaveform(timings, amplitudes, -1)
  }

  private fun chime(low: Int, high: Int): VibrationEffect {
    val timings = longArrayOf(0, 60, 80, 60, 80, 60)
    val amplitudes = intArrayOf(0, low, 0, (low + high) / 2, 0, high)
    return VibrationEffect.createWaveform(timings, amplitudes, -1)
  }
}
