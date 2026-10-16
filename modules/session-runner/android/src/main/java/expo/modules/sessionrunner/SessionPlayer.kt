package expo.modules.sessionrunner

import android.os.Looper
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.SimpleBasePlayer
import androidx.media3.common.util.UnstableApi
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

/**
 * Represents the breathing session to the media session (notification, lock screen, headset): title =
 * pattern name, duration = session length, position = elapsed, playWhenReady = running. It plays
 * nothing itself; play/pause requests are forwarded to SessionRunnerCore.
 */
@OptIn(markerClass = [UnstableApi::class])
class SessionPlayer(looper: Looper) : SimpleBasePlayer(looper) {
  fun refresh() = invalidateState()

  override fun getState(): State {
    val s = SessionRunnerCore.snapshot()
    val playing = s.active && !s.paused
    val durationMs = s.displayEndMs
    val positionMs = if (durationMs != null) minOf(s.elapsedMs, durationMs) else s.elapsedMs
    val item = MediaItemData.Builder("breathe-session")
      .setMediaMetadata(MediaMetadata.Builder().setTitle(s.title).setArtist("Breathe Well").build())
      .setDurationUs(if (durationMs != null) durationMs * 1000 else C.TIME_UNSET)
      .setIsSeekable(false)
      .build()
    return State.Builder()
      .setAvailableCommands(
        Player.Commands.Builder()
          .addAll(
            Player.COMMAND_PLAY_PAUSE,
            Player.COMMAND_GET_CURRENT_MEDIA_ITEM,
            Player.COMMAND_GET_METADATA,
            Player.COMMAND_GET_TIMELINE,
          )
          .build()
      )
      .setPlayWhenReady(playing, Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST)
      .setPlaybackState(if (s.active) Player.STATE_READY else Player.STATE_ENDED)
      .setPlaylist(listOf(item))
      .setContentPositionMs(
        if (playing) PositionSupplier.getExtrapolating(positionMs, 1f) else PositionSupplier.getConstant(positionMs)
      )
      .build()
  }

  override fun handleSetPlayWhenReady(playWhenReady: Boolean): ListenableFuture<*> {
    // Notification button, lock-screen control, or headset/Bluetooth play-pause.
    if (playWhenReady) SessionRunnerCore.resume("media", null) else SessionRunnerCore.pause("media")
    return Futures.immediateVoidFuture()
  }
}
