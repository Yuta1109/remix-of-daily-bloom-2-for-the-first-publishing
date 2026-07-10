import ActivityKit
import WidgetKit
import SwiftUI

@available(iOS 16.1, *)
private func colorFor(_ key: String) -> Color {
    switch key {
    case "green": return Color(hue: 145 / 360, saturation: 0.60, brightness: 0.70)
    case "orange": return Color(hue: 25 / 360, saturation: 0.90, brightness: 0.95)
    case "pink": return Color(hue: 335 / 360, saturation: 0.78, brightness: 0.90)
    case "purple": return Color(hue: 265 / 360, saturation: 0.65, brightness: 0.85)
    case "red": return Color(hue: 0 / 360, saturation: 0.75, brightness: 0.90)
    case "teal": return Color(hue: 180 / 360, saturation: 0.60, brightness: 0.70)
    case "gray": return Color(hue: 220 / 360, saturation: 0.08, brightness: 0.60)
    default: return Color(hue: 212 / 360, saturation: 0.90, brightness: 0.85) // blue
    }
}

@available(iOS 16.1, *)
private func headerText(_ locale: String) -> String {
    locale == "ja" ? "まもなくの予定" : "Upcoming"
}

@available(iOS 16.1, *)
private func overflowText(_ locale: String, _ n: Int) -> String {
    locale == "ja" ? "ほか\(n)件" : "+\(n) more"
}

@available(iOS 16.1, *)
struct LockScreenView: View {
    let state: EssentialsWidgetAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: "calendar")
                    .font(.caption2)
                Text(headerText(state.locale))
                    .font(.caption).bold()
                Spacer()
            }
            .foregroundStyle(.secondary)

            ForEach(Array(state.items.enumerated()), id: \.offset) { _, item in
                HStack(spacing: 8) {
                    Circle()
                        .fill(colorFor(item.color))
                        .frame(width: 8, height: 8)
                    Text(item.title)
                        .font(.subheadline).fontWeight(.medium)
                        .lineLimit(1)
                    Spacer(minLength: 8)
                    Text(item.startDate, style: .relative)
                        .font(.subheadline)
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                        .frame(minWidth: 56, alignment: .trailing)
                }
            }

            if state.overflow > 0 {
                Text(overflowText(state.locale, state.overflow))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

@available(iOS 16.1, *)
struct EssentialsWidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: EssentialsWidgetAttributes.self) { context in
            LockScreenView(state: context.state)
                .padding(14)
                .activityBackgroundTint(Color.black.opacity(0.35))
                .activitySystemActionForegroundColor(Color.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.center) {
                    LockScreenView(state: context.state)
                        .padding(.vertical, 4)
                }
            } compactLeading: {
                Image(systemName: "calendar")
            } compactTrailing: {
                if let first = context.state.items.first {
                    Text(first.startDate, style: .relative)
                        .monospacedDigit()
                        .frame(maxWidth: 52)
                }
            } minimal: {
                Image(systemName: "calendar")
            }
        }
    }
}
