import CoreHaptics
import ExpoModulesCore

// Timed haptic ramps for the breathing session (DECISIONS D9). Inhale/exhale get a continuous
// intensity ramp; sip/hold/end are short transient patterns. Falls back to nothing (silently) if the
// device has no Core Haptics engine — the JS layer switches to expo-haptics taps in that case.
public class HapticPatternModule: Module {
  private var engine: CHHapticEngine?
  private var currentPlayer: CHHapticPatternPlayer?

  public func definition() -> ModuleDefinition {
    Name("HapticPattern")

    OnCreate {
      self.setupEngine()
    }

    Function("capabilities") { () -> [String: Bool] in
      ["ramps": CHHapticEngine.capabilitiesForHardware().supportsHaptics]
    }

    Function("play") { (kind: String, durationMs: Double, strength: Double) in
      self.play(kind: kind, durationMs: durationMs, strength: strength)
    }

    Function("stop") {
      self.stopCurrent()
    }
  }

  private func setupEngine() {
    guard CHHapticEngine.capabilitiesForHardware().supportsHaptics else { return }
    do {
      let engine = try CHHapticEngine()
      // Restart on interruption/reset per Apple's guidance so playback survives phone calls, etc.
      engine.stoppedHandler = { [weak self] _ in try? self?.engine?.start() }
      engine.resetHandler = { [weak self] in try? self?.engine?.start() }
      try engine.start()
      self.engine = engine
    } catch {
      self.engine = nil
    }
  }

  private func stopCurrent() {
    try? currentPlayer?.stop(atTime: CHHapticTimeImmediate)
    currentPlayer = nil
  }

  private func play(kind: String, durationMs: Double, strength: Double) {
    guard let engine = engine else { return }
    stopCurrent()
    // strength is 0.1-1.0 (the "Haptic strength" slider); 0.45 is v1's Gentle, 0.9 its Strong.
    let peak = Float(min(1.0, max(0.1, strength)))
    let seconds = max(0.05, min(30.0, durationMs / 1000.0))

    do {
      let pattern: CHHapticPattern
      switch kind {
      case "inhale":
        pattern = try Self.rampPattern(from: peak * 0.25, to: peak, duration: seconds)
      case "exhale":
        pattern = try Self.rampPattern(from: peak, to: peak * 0.16, duration: seconds)
      case "sip":
        pattern = try Self.transientPattern([(0, peak, 0.7)])
      case "holdStart":
        pattern = try Self.transientPattern([(0, peak * 0.7, 0.4)])
      case "holdEnd":
        pattern = try Self.transientPattern([(0, peak * 0.4, 0.3)])
      case "end":
        pattern = try Self.transientPattern([
          (0, min(1, peak * 0.7), 0.5),
          (0.15, min(1, peak * 0.85), 0.5),
          (0.3, min(1, peak), 0.5),
        ])
      default:
        return
      }
      let player = try engine.makePlayer(with: pattern)
      try engine.start()
      try player.start(atTime: CHHapticTimeImmediate)
      currentPlayer = player
    } catch {
      // Playback failed silently; the session continues without this one cue.
    }
  }

  private static func rampPattern(from: Float, to: Float, duration: TimeInterval) throws -> CHHapticPattern {
    let curve = CHHapticParameterCurve(
      parameterID: .hapticIntensityControl,
      controlPoints: [
        CHHapticParameterCurve.ControlPoint(relativeTime: 0, value: from),
        CHHapticParameterCurve.ControlPoint(relativeTime: duration, value: to),
      ],
      relativeTime: 0
    )
    let event = CHHapticEvent(
      eventType: .hapticContinuous,
      parameters: [CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.3)],
      relativeTime: 0,
      duration: duration
    )
    return try CHHapticPattern(events: [event], parameterCurves: [curve])
  }

  /** Each tuple is (relativeTime, intensity, sharpness); used for taps and the multi-tap end chime. */
  private static func transientPattern(_ taps: [(Double, Float, Float)]) throws -> CHHapticPattern {
    let events = taps.map { relativeTime, intensity, sharpness in
      CHHapticEvent(
        eventType: .hapticTransient,
        parameters: [
          CHHapticEventParameter(parameterID: .hapticIntensity, value: intensity),
          CHHapticEventParameter(parameterID: .hapticSharpness, value: sharpness),
        ],
        relativeTime: relativeTime
      )
    }
    return try CHHapticPattern(events: events, parameters: [])
  }
}
