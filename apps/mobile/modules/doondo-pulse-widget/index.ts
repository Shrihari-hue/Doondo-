/**
 * doondo-pulse-widget — the native bridge for the Doondo Pulse home-screen
 * widget (#30).
 *
 * A widget extension (iOS WidgetKit) / App Widget (Android) runs outside
 * the app's JS process, so it can't call the API directly — it reads
 * whatever the app last wrote to shared storage:
 *   - iOS: UserDefaults in the App Group both the app and the widget
 *     extension belong to (`group.com.doondo.app.widget`).
 *   - Android: a SharedPreferences file the widget's RemoteViews are
 *     rebuilt from on each `AppWidgetManager` update.
 *
 * `setSnapshot` writes the latest Pulse data and asks the OS to redraw
 * the widget "soon" (iOS: WidgetKit's timeline reload; Android: an
 * explicit AppWidgetManager update broadcast). Call it every time
 * `usePulse()` gets a fresh snapshot — see src/lib/pulseWidget.ts, which
 * lazy-loads this module so the app still runs in Expo Go / a dev
 * client built before the widget was added.
 */
import { requireNativeModule } from 'expo-modules-core';

export interface PulseWidgetSnapshot {
  /** Doondo Score, 0-100. */
  score: number;
  /** Current consecutive apply-streak days. */
  applyStreak: number;
  /** i18n-resolved, already-localized nudge text — the widget has no i18n of its own. */
  nudgeText: string;
  /** ISO timestamp this snapshot was written, so the widget can show "Updated Xm ago" if it wants. */
  updatedAt: string;
}

interface DoondoPulseWidgetNativeModule {
  /** Persist the snapshot to shared storage and ask the OS to redraw the widget. */
  setSnapshot(snapshot: PulseWidgetSnapshot): void;
}

let native: DoondoPulseWidgetNativeModule | null | undefined;

/** Lazily resolve the native module — undefined on a build that doesn't include it (Expo Go, pre-rebuild dev client). */
function getNative(): DoondoPulseWidgetNativeModule | null {
  if (native !== undefined) return native;
  try {
    native = requireNativeModule<DoondoPulseWidgetNativeModule>('DoondoPulseWidget');
  } catch {
    native = null;
  }
  return native;
}

/**
 * Write the latest Pulse snapshot for the home-screen widget to read.
 * No-ops safely (never throws) when the native module isn't present.
 */
export function setPulseWidgetSnapshot(snapshot: PulseWidgetSnapshot): void {
  try {
    getNative()?.setSnapshot(snapshot);
  } catch {
    // Never let a widget-refresh failure affect the app itself.
  }
}
