package app.doondo.pulsewidget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

// Shared prefs file both this module and PulseWidgetProvider read/write —
// unlike iOS there's no cross-process App Group needed here, the widget
// provider runs in the same app package. If you rename this file, update
// PulseWidgetProvider.kt in widget-src/android to match.
private const val PREFS_NAME = "doondo_pulse_widget"
private const val SNAPSHOT_KEY = "snapshot_json"

class DoondoPulseWidgetModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DoondoPulseWidget")

    Function("setSnapshot") { snapshot: Map<String, Any?> ->
      val context = appContext.reactContext ?: return@Function
      val json = JSONObject(snapshot)
      context
        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .putString(SNAPSHOT_KEY, json.toString())
        .apply()

      // Ask AppWidgetManager to redraw every placed instance of the
      // Pulse widget right away, same rationale as WidgetKit's
      // reloadAllTimelines() on iOS.
      val manager = AppWidgetManager.getInstance(context)
      val component = ComponentName(context, "app.doondo.pulsewidget.PulseWidgetProvider")
      val ids = manager.getAppWidgetIds(component)
      if (ids.isNotEmpty()) {
        val updateIntent = android.content.Intent(context, Class.forName("app.doondo.pulsewidget.PulseWidgetProvider"))
        updateIntent.action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
        updateIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
        context.sendBroadcast(updateIntent)
      }
    }
  }
}
