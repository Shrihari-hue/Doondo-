// DoondoPulseWidget.swift
//
// The iOS home-screen widget for Doondo Pulse (#30) — shows the worker's
// Doondo Score, apply streak, and next-step nudge without opening the app.
//
// NOT auto-wired into the Xcode project by the config plugin — adding a
// Widget Extension target requires either Xcode itself or risky raw
// .pbxproj surgery this session can't verify. One-time manual step:
//   1. Xcode -> File -> New -> Target -> Widget Extension
//      Product name: DoondoPulseWidget · uncheck "Include Configuration
//      Intent" (this widget has none) · bundle id suffix: .DoondoPulseWidget
//   2. Delete the placeholder Swift file Xcode generates; add this file
//      (and DoondoPulseWidgetBundle below) to that new target instead.
//   3. Target -> Signing & Capabilities -> + App Groups ->
//      group.com.doondo.app.widget (must match the main app target's
//      App Group, and APP_GROUP_ID in DoondoPulseWidgetModule.swift).
//   4. plugins/withDoondoPulseWidget.ts already adds that same App Group
//      entitlement to the MAIN app target automatically — this step only
//      needs doing on the new widget extension target.
//
// Everything else (the actual widget UI/logic below, plus the native
// bridge that feeds it) is real, complete code — this file is what you
// add to the target in step 2, not a stub to fill in.

import WidgetKit
import SwiftUI

private let APP_GROUP_ID = "group.com.doondo.app.widget"
private let SNAPSHOT_KEY = "doondo.pulse.snapshot"
private let BRAND_BLUE = Color(red: 0x25 / 255, green: 0x63 / 255, blue: 0xEB / 255)

// ─── Data ───────────────────────────────────────────────────────────────────

struct PulseSnapshot: Decodable {
  let score: Int
  let applyStreak: Int
  let nudgeText: String
  let updatedAt: String
}

struct PulseEntry: TimelineEntry {
  let date: Date
  let snapshot: PulseSnapshot?
}

/// Reads whatever DoondoPulseWidgetModule.swift last wrote to the App
/// Group. Nil when the worker hasn't opened the app since installing
/// the widget yet — the view has an honest empty state for that.
struct PulseTimelineProvider: TimelineProvider {
  func placeholder(in context: Context) -> PulseEntry {
    PulseEntry(date: Date(), snapshot: PulseSnapshot(score: 72, applyStreak: 3, nudgeText: "Explore jobs near you", updatedAt: ISO8601DateFormatter().string(from: Date())))
  }

  func getSnapshot(in context: Context, completion: @escaping (PulseEntry) -> Void) {
    completion(PulseEntry(date: Date(), snapshot: readSnapshot()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<PulseEntry>) -> Void) {
    let entry = PulseEntry(date: Date(), snapshot: readSnapshot())
    // The app pushes a reload every time it has fresh data (see
    // DoondoPulseWidgetModule.setSnapshot's reloadAllTimelines() call),
    // so this fallback refresh is just a safety net for a worker who
    // hasn't opened the app in a while — every 4 hours is plenty.
    let nextRefresh = Calendar.current.date(byAdding: .hour, value: 4, to: Date()) ?? Date().addingTimeInterval(4 * 3600)
    completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
  }

  private func readSnapshot() -> PulseSnapshot? {
    guard let defaults = UserDefaults(suiteName: APP_GROUP_ID),
          let data = defaults.data(forKey: SNAPSHOT_KEY) else { return nil }
    return try? JSONDecoder().decode(PulseSnapshot.self, from: data)
  }
}

// ─── View ───────────────────────────────────────────────────────────────────

struct DoondoPulseWidgetView: View {
  @Environment(\.widgetFamily) var family
  let entry: PulseEntry

  var body: some View {
    if let snapshot = entry.snapshot {
      content(for: snapshot)
    } else {
      emptyState
    }
  }

  private var emptyState: some View {
    VStack(spacing: 4) {
      Text("Doondo")
        .font(.system(size: 13, weight: .bold))
        .foregroundColor(BRAND_BLUE)
      Text("Open the app to see your Pulse")
        .font(.system(size: 11))
        .foregroundColor(.secondary)
        .multilineTextAlignment(.center)
        .padding(.horizontal, 8)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .containerBackground(.fill.tertiary, for: .widget)
  }

  @ViewBuilder
  private func content(for snapshot: PulseSnapshot) -> some View {
    switch family {
    case .systemSmall:
      VStack(alignment: .leading, spacing: 6) {
        Text("DOONDO PULSE")
          .font(.system(size: 9, weight: .bold))
          .foregroundColor(.secondary)
        Spacer()
        HStack(alignment: .firstTextBaseline, spacing: 2) {
          Text("\(snapshot.score)")
            .font(.system(size: 34, weight: .heavy))
            .foregroundColor(BRAND_BLUE)
          Text("/100")
            .font(.system(size: 11, weight: .semibold))
            .foregroundColor(.secondary)
        }
        if snapshot.applyStreak > 0 {
          Text("🔥 \(snapshot.applyStreak)-day streak")
            .font(.system(size: 11, weight: .semibold))
        }
        Spacer()
        Text(snapshot.nudgeText)
          .font(.system(size: 11))
          .foregroundColor(.secondary)
          .lineLimit(2)
      }
      .padding(14)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
      .containerBackground(.background, for: .widget)

    default: // .systemMedium and larger
      HStack(spacing: 16) {
        VStack(alignment: .leading, spacing: 2) {
          Text("DOONDO PULSE")
            .font(.system(size: 10, weight: .bold))
            .foregroundColor(.secondary)
          HStack(alignment: .firstTextBaseline, spacing: 2) {
            Text("\(snapshot.score)")
              .font(.system(size: 40, weight: .heavy))
              .foregroundColor(BRAND_BLUE)
            Text("/100")
              .font(.system(size: 12, weight: .semibold))
              .foregroundColor(.secondary)
          }
        }
        Divider()
        VStack(alignment: .leading, spacing: 6) {
          if snapshot.applyStreak > 0 {
            Text("🔥 \(snapshot.applyStreak)-day apply streak")
              .font(.system(size: 13, weight: .semibold))
          }
          Text(snapshot.nudgeText)
            .font(.system(size: 12))
            .foregroundColor(.secondary)
            .lineLimit(3)
        }
        Spacer()
      }
      .padding(14)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .containerBackground(.background, for: .widget)
    }
  }
}

// ─── Widget + bundle ────────────────────────────────────────────────────────

struct DoondoPulseWidget: Widget {
  let kind: String = "DoondoPulseWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: PulseTimelineProvider()) { entry in
      DoondoPulseWidgetView(entry: entry)
    }
    .configurationDisplayName("Doondo Pulse")
    .description("Your Doondo Score, apply streak, and next step.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

@main
struct DoondoPulseWidgetBundle: WidgetBundle {
  var body: some Widget {
    DoondoPulseWidget()
  }
}
