import ActivityKit
import WidgetKit
import SwiftUI

// Match in-app page background (HSL 40 20% 98%) with Essences orange accent.
@available(iOS 16.1, *)
private enum EssencesLAStyle {
    static let background = Color(red: 0.980, green: 0.973, blue: 0.961)
    static let title = Color(red: 0.08, green: 0.09, blue: 0.12)
    static let muted = Color(red: 0.42, green: 0.43, blue: 0.46)
    static let accent = Color(red: 0.92, green: 0.48, blue: 0.22)
}

@available(iOS 16.1, *)
private func colorFor(_ key: String) -> Color {
    switch key {
    case "green": return Color(hue: 145 / 360, saturation: 0.55, brightness: 0.55)
    case "orange": return EssencesLAStyle.accent
    case "pink": return Color(hue: 335 / 360, saturation: 0.70, brightness: 0.72)
    case "purple": return Color(hue: 265 / 360, saturation: 0.55, brightness: 0.65)
    case "red": return Color(hue: 0 / 360, saturation: 0.70, brightness: 0.68)
    case "teal": return Color(hue: 180 / 360, saturation: 0.55, brightness: 0.55)
    case "gray": return Color(hue: 220 / 360, saturation: 0.08, brightness: 0.50)
    default: return Color(hue: 212 / 360, saturation: 0.75, brightness: 0.62)
    }
}

@available(iOS 16.1, *)
private func headerText(_ locale: String) -> String {
    locale == "ja" ? "今後の予定" : "Upcoming"
}

@available(iOS 16.1, *)
private func arrivedText(_ locale: String) -> String {
    locale == "ja" ? "予定時間になりました" : "It's time"
}

@available(iOS 16.1, *)
private func overflowText(_ locale: String, _ n: Int) -> String {
    locale == "ja" ? "ほか\(n)件" : "+\(n) more"
}

/// Relative countdown — evaluated at Activity.update time (see LiveActivityRefreshCenter).
/// TimelineView is intentionally not used: Lock Screen often freezes custom TimelineView
/// text until the app refreshes the activity.
@available(iOS 16.1, *)
func essencesRelativeRemaining(from now: Date, to target: Date, locale: String) -> String {
    let total = max(0, Int(target.timeIntervalSince(now)))
    let hours = total / 3600
    let minutes = (total % 3600) / 60
    if locale == "ja" {
        if now >= target { return arrivedText(locale) }
        if total < 60 { return "まもなく" }
        if hours > 0 { return "\(hours)時間\(minutes)分後" }
        return "\(minutes)分後"
    }
    if now >= target { return arrivedText(locale) }
    if total < 60 { return "soon" }
    if hours > 0 { return "in \(hours)h \(minutes)m" }
    return "in \(minutes)m"
}

@available(iOS 16.1, *)
private struct RelativeOrArrivedLabel: View {
    let target: Date
    let locale: String
    /// Bumped by heartbeat / FCM update → view re-renders with a fresh `Date()`.
    let tick: Int

    var body: some View {
        Text(essencesRelativeRemaining(from: Date(), to: target, locale: locale))
            .font(.caption.weight(.semibold))
            .foregroundStyle(EssencesLAStyle.accent)
            .lineLimit(1)
            .minimumScaleFactor(0.85)
            .id(tick)
    }
}

/// Compact Lock Screen card — fits up to 3 rows without clipping.
@available(iOS 16.1, *)
struct LockScreenView: View {
    let state: EssencesWidgetAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 5) {
                Image(systemName: "calendar")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(EssencesLAStyle.accent)
                Text(headerText(state.locale))
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(EssencesLAStyle.muted)
                Spacer(minLength: 0)
            }

            ForEach(Array(state.items.enumerated()), id: \.offset) { _, item in
                HStack(alignment: .center, spacing: 8) {
                    Capsule()
                        .fill(colorFor(item.color))
                        .frame(width: 3, height: 22)

                    Text(item.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(EssencesLAStyle.title)
                        .lineLimit(1)

                    Spacer(minLength: 6)

                    RelativeOrArrivedLabel(
                        target: item.startDate,
                        locale: state.locale,
                        tick: state.tick
                    )
                    .frame(minWidth: 72, alignment: .trailing)
                }
            }

            if state.overflow > 0 {
                Text(overflowText(state.locale, state.overflow))
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(EssencesLAStyle.muted)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(EssencesLAStyle.background)
        // Re-evaluate relative labels whenever tick changes.
        .id(state.tick)
    }
}

@available(iOS 16.1, *)
struct EssencesWidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: EssencesWidgetAttributes.self) { context in
            LockScreenView(state: context.state)
                .widgetURL(URL(string: "essences://live-activity"))
                .activityBackgroundTint(EssencesLAStyle.background)
                .activitySystemActionForegroundColor(EssencesLAStyle.title)
        } dynamicIsland: { _ in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    EmptyView()
                }
            } compactLeading: {
                EmptyView()
            } compactTrailing: {
                EmptyView()
            } minimal: {
                EmptyView()
            }
        }
    }
}
