package expo.modules.quicktile

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri

/**
 * The app's start link (`<scheme>://start`, D37) as an Intent. The scheme differs per build variant, so
 * `plugins/with-launch-scheme.js` writes it into the manifest as meta-data; the app's launch-intent parser
 * does the rest (default pattern and length).
 */
object LaunchLink {
  const val META_SCHEME = "com.tim.breathe.LAUNCH_SCHEME"

  fun scheme(context: Context): String {
    val info = runCatching {
      @Suppress("DEPRECATION")
      context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
    }.getOrNull()
    return info?.metaData?.getString(META_SCHEME) ?: "breathe"
  }

  fun startIntent(context: Context): Intent =
    Intent(Intent.ACTION_VIEW, Uri.parse("${scheme(context)}://start"))
      .setPackage(context.packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
}
