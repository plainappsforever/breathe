package expo.modules.startwidget

import android.content.Context
import java.util.Calendar

/**
 * "Minutes today" as the app last pushed it: the local day it belongs to (start of day, ms) and the number.
 * A value from an earlier day reads as 0, so the widget is right after midnight without the app.
 */
object TodayMinutes {
  private const val PREFS = "breathe_start_widget"
  private const val KEY_DAY = "dayStart"
  private const val KEY_MINUTES = "minutes"

  fun save(context: Context, dayStart: Long, minutes: Int) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putLong(KEY_DAY, dayStart).putInt(KEY_MINUTES, minutes).apply()
  }

  fun read(context: Context, now: Long): Int {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    return valueFor(prefs.getLong(KEY_DAY, -1L), prefs.getInt(KEY_MINUTES, 0), startOfDay(now))
  }

  /** Pure: the stored number only counts on the day it was stored for. */
  fun valueFor(storedDay: Long, storedMinutes: Int, today: Long): Int = if (storedDay == today) storedMinutes.coerceAtLeast(0) else 0

  fun label(minutes: Int): String = "$minutes min today"

  fun startOfDay(now: Long): Long = Calendar.getInstance().apply {
    timeInMillis = now
    set(Calendar.HOUR_OF_DAY, 0)
    set(Calendar.MINUTE, 0)
    set(Calendar.SECOND, 0)
    set(Calendar.MILLISECOND, 0)
  }.timeInMillis

  fun nextMidnight(now: Long): Long = Calendar.getInstance().apply {
    timeInMillis = startOfDay(now)
    add(Calendar.DAY_OF_YEAR, 1)
  }.timeInMillis
}
