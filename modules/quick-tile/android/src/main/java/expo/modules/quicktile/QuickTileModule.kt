package expo.modules.quicktile

import android.app.StatusBarManager
import android.content.ComponentName
import android.graphics.drawable.Icon
import android.os.Build
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Settings > "Add the Breathe tile": the system's own "Add tile" dialog (Android 13+). */
class QuickTileModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("QuickTile")

    Function("canRequestAddTile") { Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU }

    AsyncFunction("requestAddTile") { promise: Promise ->
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
        promise.resolve("unsupported")
        return@AsyncFunction
      }
      val statusBar = context.getSystemService(StatusBarManager::class.java)
      if (statusBar == null) {
        promise.resolve("unsupported")
        return@AsyncFunction
      }
      statusBar.requestAddTileService(
        ComponentName(context, BreatheTileService::class.java),
        BreatheTileService.LABEL,
        Icon.createWithResource(context, R.drawable.breathe_ic_tile),
        context.mainExecutor,
      ) { result ->
        promise.resolve(
          when (result) {
            StatusBarManager.TILE_ADD_REQUEST_RESULT_TILE_ADDED -> "added"
            StatusBarManager.TILE_ADD_REQUEST_RESULT_TILE_ALREADY_ADDED -> "alreadyAdded"
            StatusBarManager.TILE_ADD_REQUEST_RESULT_TILE_NOT_ADDED -> "notAdded"
            else -> "error:$result"
          }
        )
      }
    }
  }
}
