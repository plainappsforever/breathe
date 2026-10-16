package expo.modules.quicktile

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import android.util.Log

private const val TAG = "BreatheTile"

/**
 * v3 P7.2: the "Breathe" Quick Settings tile. One job: a tap collapses the shade and opens the app on the
 * start link, which starts the user's default session (last used pattern and length). It keeps no state,
 * so it is always drawn inactive ("an action", like Screen record). From the lock screen the phone asks
 * to unlock first.
 */
class BreatheTileService : TileService() {
  override fun onTileAdded() = render()

  override fun onStartListening() = render()

  override fun onClick() {
    Log.d(TAG, "tile click (locked=$isLocked)")
    if (isLocked) unlockAndRun { openStartLink() } else openStartLink()
  }

  @SuppressLint("StartActivityAndCollapseDeprecated")
  private fun openStartLink() {
    val intent = LaunchLink.startIntent(this)
    if (Build.VERSION.SDK_INT >= 34) {
      // Android 14+: only the PendingIntent overload is allowed (the Intent one throws).
      startActivityAndCollapse(
        PendingIntent.getActivity(this, 70, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      )
    } else {
      @Suppress("DEPRECATION")
      startActivityAndCollapse(intent)
    }
  }

  private fun render() {
    val tile = qsTile ?: return
    tile.state = Tile.STATE_INACTIVE
    tile.label = LABEL
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) tile.subtitle = SUBTITLE
    tile.contentDescription = "$LABEL: $SUBTITLE"
    tile.updateTile()
  }

  companion object {
    const val LABEL = "Breathe"
    const val SUBTITLE = "Start a session"
  }
}
