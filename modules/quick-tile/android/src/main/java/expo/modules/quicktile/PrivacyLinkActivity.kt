package expo.modules.quicktile

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle

/**
 * Health Connect's "Read privacy policy" (ACTION_SHOW_PERMISSIONS_RATIONALE, Android 13 and lower) and Settings >
 * Permission usage (the ViewPermissionUsageActivity alias, Android 14+) land here (plugins/with-health-rationale.js,
 * v3.1 F2). It opens the app on its privacy policy screen, `<scheme>://privacy`, and closes itself.
 */
class PrivacyLinkActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val link = Intent(Intent.ACTION_VIEW, Uri.parse("${LaunchLink.scheme(this)}://privacy"))
      .setPackage(packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    runCatching { startActivity(link) }
    finish()
  }
}
