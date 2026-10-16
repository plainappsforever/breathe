package expo.modules.startwidget

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.util.Log
import android.widget.RemoteViews

private const val TAG = "BreatheWidget"

/**
 * v3 P7.3: the "Breathe" home-screen widget. Plain RemoteViews (the eye-app approach, D66 there) instead of
 * react-native-android-widget: no JS runs for it. It shows "N min today" and a Breathe button; a tap anywhere
 * opens the start link (the user's default session, D37). The app pushes the number (StartWidgetModule);
 * a non-waking alarm redraws at local midnight so yesterday's minutes never show as today's.
 */
class StartWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    render(context, appWidgetManager, appWidgetIds)
  }

  override fun onDisabled(context: Context) {
    alarmManager(context)?.cancel(midnightIntent(context))
  }

  companion object {
    fun componentName(context: Context) = ComponentName(context, StartWidgetProvider::class.java)

    fun widgetIds(context: Context): IntArray =
      runCatching { AppWidgetManager.getInstance(context).getAppWidgetIds(componentName(context)) }.getOrDefault(IntArray(0))

    fun refresh(context: Context) {
      val ids = widgetIds(context)
      if (ids.isNotEmpty()) render(context, AppWidgetManager.getInstance(context), ids)
    }

    private fun render(context: Context, manager: AppWidgetManager, ids: IntArray) {
      if (ids.isEmpty()) return
      val now = System.currentTimeMillis()
      val minutes = TodayMinutes.read(context, now)
      val views = RemoteViews(context.packageName, R.layout.breathe_widget)
      views.setTextViewText(R.id.breathe_widget_today, TodayMinutes.label(minutes))
      val start = PendingIntent.getActivity(
        context, 71, LaunchLink.startIntent(context), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
      views.setOnClickPendingIntent(R.id.breathe_widget_root, start)
      views.setOnClickPendingIntent(R.id.breathe_widget_start, start)
      views.setContentDescription(R.id.breathe_widget_start, "Breathe: start a session")
      manager.updateAppWidget(ids, views)
      scheduleMidnight(context, now)
      Log.d(TAG, "widget drawn: ${TodayMinutes.label(minutes)} (${ids.size})")
    }

    private fun alarmManager(context: Context) = context.getSystemService(AlarmManager::class.java)

    private fun midnightIntent(context: Context): PendingIntent {
      val intent = Intent(context, StartWidgetProvider::class.java)
        .setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
        .putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, widgetIds(context))
      return PendingIntent.getBroadcast(context, 72, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    /** RTC (not RTC_WAKEUP), inexact: redraws when the phone is next awake after midnight; no permission. */
    private fun scheduleMidnight(context: Context, now: Long) {
      runCatching { alarmManager(context)?.set(AlarmManager.RTC, TodayMinutes.nextMidnight(now) + 5_000, midnightIntent(context)) }
        .onFailure { Log.w(TAG, "midnight alarm failed: ${it.message}") }
    }
  }
}
