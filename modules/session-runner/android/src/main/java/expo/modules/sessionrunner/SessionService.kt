package expo.modules.sessionrunner

import android.app.PendingIntent
import android.content.Intent
import android.os.Bundle
import android.os.Looper
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.CommandButton
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

/**
 * mediaPlayback foreground service for "Keep guiding when locked" on Android (D39). Its media session
 * gives the session notification / lock-screen controls (Play-Pause from the player state, plus End)
 * and receives headset buttons. The cues themselves run in SessionRunnerCore in the same process.
 */
@OptIn(markerClass = [UnstableApi::class])
class SessionService : MediaSessionService() {
  private var session: MediaSession? = null

  override fun onCreate() {
    super.onCreate()
    val player = SessionPlayer(Looper.getMainLooper())
    val endButton = CommandButton.Builder(CommandButton.ICON_STOP)
      .setDisplayName("End")
      .setSessionCommand(SessionCommand(END_ACTION, Bundle.EMPTY))
      .setSlots(CommandButton.SLOT_FORWARD, CommandButton.SLOT_OVERFLOW)
      .build()
    val builder = MediaSession.Builder(this, player)
      .setId(SESSION_ID) // expo-audio may own another session in this process; ids must differ.
      .setCallback(Callback(endButton))
      .setMediaButtonPreferences(listOf(endButton))
    packageManager.getLaunchIntentForPackage(packageName)?.let { launch ->
      builder.setSessionActivity(
        PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
      )
    }
    val s = builder.build()
    session = s
    // An ended session leaves no notification behind (and media3 never re-foregrounds for one).
    setShowNotificationForIdlePlayer(SHOW_NOTIFICATION_FOR_IDLE_PLAYER_NEVER)
    addSession(s)
    SessionRunnerCore.attachService(this, player)
  }

  /** Session over: media3's own teardown (dismisses the notification, leaves the foreground, stops). */
  fun stopSession() {
    pauseAllPlayersAndStopSelf()
  }

  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

  override fun onTaskRemoved(rootIntent: Intent?) {
    // The app was swiped away: end the session. JS (still alive in the process) saves it to History; if
    // the process is gone instead, the app's crash recovery handles it on the next launch.
    SessionRunnerCore.end("task", false)
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    SessionRunnerCore.detachService(this)
    session?.run {
      player.release()
      release()
    }
    session = null
    super.onDestroy()
  }

  private class Callback(private val endButton: CommandButton) : MediaSession.Callback {
    override fun onConnect(session: MediaSession, controller: MediaSession.ControllerInfo): MediaSession.ConnectionResult {
      val commands = MediaSession.ConnectionResult.DEFAULT_SESSION_COMMANDS.buildUpon()
        .add(SessionCommand(END_ACTION, Bundle.EMPTY))
        .build()
      return MediaSession.ConnectionResult.AcceptedResultBuilder(session)
        .setAvailableSessionCommands(commands)
        .setMediaButtonPreferences(listOf(endButton))
        .build()
    }

    override fun onCustomCommand(
      session: MediaSession,
      controller: MediaSession.ControllerInfo,
      customCommand: SessionCommand,
      args: Bundle,
    ): ListenableFuture<SessionResult> {
      if (customCommand.customAction == END_ACTION) {
        SessionRunnerCore.end("media", null)
        return Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))
      }
      return super.onCustomCommand(session, controller, customCommand, args)
    }
  }

  companion object {
    const val END_ACTION = "breathe.END"
    const val SESSION_ID = "BreatheWellSessionRunner"
  }
}
