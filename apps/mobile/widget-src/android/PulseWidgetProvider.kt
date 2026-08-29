// PulseWidgetProvider.kt
//
// The Android home-screen widget for Doondo Pulse (#30) — shows the
// worker's Doondo Score, apply streak, and next-step nudge without
// opening the app.
//
// Unlike the iOS side, this needs NO manual Xcode-style target step:
// plugins/withDoondoPulseWidget.ts copies this file (and the res/
// files next to it) into android/app/src/main/... and registers the
// <receiver> in AndroidManifest.xml automatically during `expo prebuild`.
// Package must stay app.doondo.pulsewidget to match
// DoondoPulseWidgetModule.kt's ComponentName lookup and the manifest
// entry the config plugin writes.
//
// That package is DIFFERENT from the main app module's own package
// (com.doondo.app, from app.json's android.package) even though this
// file physically lives inside the app module once copied there — so
// the generated R class (which belongs to com.doondo.app) needs an
// explicit import below rather than resolving implicitly. If you ever
// rename the app's package in app.json, update this import to match.

package app.doondo.pulsewidget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews
import com.doondo.app.R
import org.json.JSONObject

private const val PREFS_NAME = "doondo_pulse_widget"
private const val SNAPSHOT_KEY = "snapshot_json"

class PulseWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    for (id in appWidgetIds) {
      appWidgetManager.updateAppWidget(id, buildRemoteViews(context))
    }
  }

  private fun buildRemoteViews(context: Context): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.widget_pulse)
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val raw = prefs.getString(SNAPSHOT_KEY, null)

    if (raw == null) {
      views.setViewVisibility(R.id.pulse_empty_state, android.view.View.VISIBLE)
      views.setViewVisibility(R.id.pulse_content, android.view.View.GONE)
    } else {
      val json = JSONObject(raw)
      views.setViewVisibility(R.id.pulse_empty_state, android.view.View.GONE)
      views.setViewVisibility(R.id.pulse_content, android.view.View.VISIBLE)
      views.setTextViewText(R.id.pulse_score, json.optInt("score", 0).toString())
      val streak = json.optInt("applyStreak", 0)
      if (streak > 0) {
        views.setViewVisibility(R.id.pulse_streak, android.view.View.VISIBLE)
        views.setTextViewText(R.id.pulse_streak, "🔥 $streak-day streak")
      } else {
        views.setViewVisibility(R.id.pulse_streak, android.view.View.GONE)
      }
      views.setTextViewText(R.id.pulse_nudge, json.optString("nudgeText", ""))
    }

    // Tapping the widget opens the app via the standard launcher intent.
    // Not using a doondo:// deep link here — this codebase doesn't have
    // a confirmed React Navigation linking config for a "home" path, so
    // the launcher intent is the reliable choice: it always opens the
    // app (to whatever its default entry screen is) rather than risking
    // a silent no-op tap if a specific deep-link route doesn't exist.
    val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
    if (launchIntent != null) {
      val pendingIntent = PendingIntent.getActivity(
        context,
        0,
        launchIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
      views.setOnClickPendingIntent(R.id.pulse_widget_root, pendingIntent)
    }

    return views
  }
}
