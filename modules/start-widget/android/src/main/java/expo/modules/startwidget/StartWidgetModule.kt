package expo.modules.startwidget

import android.appwidget.AppWidgetManager
import android.os.Build
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** The app pushes today's minutes to the widget, and Settings can offer the launcher's "Add to home screen". */
class StartWidgetModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("StartWidget")

    Function("setTodayMinutes") { dayStartMs: Double, minutes: Int ->
      TodayMinutes.save(context, dayStartMs.toLong(), minutes)
      StartWidgetProvider.refresh(context)
    }

    Function("widgetCount") { StartWidgetProvider.widgetIds(context).size }

    Function("canPinWidget") {
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
        context.getSystemService(AppWidgetManager::class.java)?.isRequestPinAppWidgetSupported == true
    }

    /** "requested" (the launcher shows its dialog), "alreadyAdded" or "unsupported". */
    Function("requestPinWidget") {
      if (StartWidgetProvider.widgetIds(context).isNotEmpty()) return@Function "alreadyAdded"
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return@Function "unsupported"
      val manager = context.getSystemService(AppWidgetManager::class.java)
      if (manager == null || !manager.isRequestPinAppWidgetSupported) return@Function "unsupported"
      if (manager.requestPinAppWidget(StartWidgetProvider.componentName(context), null, null)) "requested" else "unsupported"
    }
  }
}
