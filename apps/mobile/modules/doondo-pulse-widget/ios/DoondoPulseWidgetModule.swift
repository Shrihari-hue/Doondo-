// DoondoPulseWidgetModule.swift
//
// Expo Modules API bridge — writes the latest Pulse snapshot into the
// App Group's shared UserDefaults, then asks WidgetKit to reload the
// widget's timeline so the change shows up promptly instead of waiting
// for the OS's own refresh budget.
//
// The App Group id below MUST match:
//   - the entitlement the config plugin (plugins/withDoondoPulseWidget.ts)
//     adds to BOTH the main app target and the widget extension target
//   - APP_GROUP_ID in widget-src/ios/DoondoPulseWidget.swift
// If you rename it, change it in all three places.

import ExpoModulesCore
import WidgetKit

private let APP_GROUP_ID = "group.com.doondo.app.widget"
private let SNAPSHOT_KEY = "doondo.pulse.snapshot"

public class DoondoPulseWidgetModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DoondoPulseWidget")

    Function("setSnapshot") { (snapshot: [String: Any]) in
      guard let defaults = UserDefaults(suiteName: APP_GROUP_ID) else { return }

      // Store as JSON so the widget's TimelineProvider decodes one typed
      // struct rather than reading loose UserDefaults keys.
      if let data = try? JSONSerialization.data(withJSONObject: snapshot) {
        defaults.set(data, forKey: SNAPSHOT_KEY)
      }

      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadAllTimelines()
      }
    }
  }
}
