package expo.modules.sessionrunner

import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class CueRecord : Record {
  @Field var atMs: Double = 0.0
  @Field var kind: String = ""
  @Field var durationMs: Double = 0.0
}

class RunnerOptionsRecord : Record {
  @Field var title: String = ""
  @Field var elapsedMs: Double = 0.0
  @Field var displayEndMs: Double? = null
  @Field var sound: Boolean = true
  @Field var haptics: String = "on"
  @Field var hapticStrength: Double = 0.45
  @Field var volume: Double = 1.0
  @Field var endSound: String = "chime"
  @Field var endCueMinMs: Double = 0.0
}

/** JS face of SessionRunnerCore (see modules/session-runner/src). Android only; iOS keeps D32. */
class SessionRunnerModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("SessionRunner")
    Events("onAction")

    OnCreate {
      SessionRunnerCore.actionListener = SessionRunnerCore.ActionListener { action, elapsedMs ->
        sendEvent("onAction", mapOf("action" to action, "elapsedMs" to elapsedMs.toDouble()))
      }
    }

    OnDestroy {
      // JS went away (reload, app closed): never leave cues running without their screen.
      SessionRunnerCore.actionListener = null
      SessionRunnerCore.end("app", false)
    }

    Function("prepare") { SessionRunnerCore.prepare(context) }

    Function("start") { cues: List<CueRecord>, options: RunnerOptionsRecord ->
      SessionRunnerCore.start(
        context,
        cues.map { Cue(it.atMs.toLong(), it.kind, it.durationMs.toLong()) },
        RunnerSettings(
          title = options.title,
          displayEndMs = options.displayEndMs?.toLong(),
          sound = options.sound,
          haptics = options.haptics,
          strength = options.hapticStrength,
          volume = options.volume.toFloat().coerceIn(0f, 1f),
          endSound = options.endSound,
          endCueMinMs = options.endCueMinMs.toLong(),
        ),
        options.elapsedMs.toLong(),
      )
    }

    Function("update") { cues: List<CueRecord>, displayEndMs: Double? ->
      SessionRunnerCore.update(cues.map { Cue(it.atMs.toLong(), it.kind, it.durationMs.toLong()) }, displayEndMs?.toLong())
    }

    Function("pause") { SessionRunnerCore.pause("app") }

    Function("resume") { elapsedMs: Double -> SessionRunnerCore.resume("app", elapsedMs.toLong()) }

    Function("end") { playCue: Boolean -> SessionRunnerCore.end("app", playCue) }

    Function("stop") { SessionRunnerCore.end("app", false) }

    Function("isRunning") { SessionRunnerCore.active }

    // V3 P6 (D50): reminders are exact only while the user has allowed "Alarms & reminders" (Android 12+).
    Function("canScheduleExactAlarms") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) true
      else (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).canScheduleExactAlarms()
    }

    // Opens this app's "Alarms & reminders" page (Android 12+); false if the phone has no such page.
    Function("openExactAlarmSettings") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
        false
      } else {
        try {
          val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + context.packageName))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          context.startActivity(intent)
          true
        } catch (e: Exception) {
          false
        }
      }
    }
  }
}
