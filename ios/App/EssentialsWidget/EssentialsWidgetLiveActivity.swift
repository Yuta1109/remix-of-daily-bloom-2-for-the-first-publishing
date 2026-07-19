import ActivityKit
import WidgetKit
import SwiftUI

// Warm dark palette aligned with Essences accent (HSL ~25 80% 58%) on charcoal.
@available(iOS 16.1, *)
private enum EssencesLAStyle {
    static let background = Color(red: 0.11, green: 0.09, blue: 0.08)
    static let cream = Color(red: 0.98, green: 0.96, blue: 0.93)
    static let muted = Color(red: 0.72, green: 0.66, blue: 0.60)
    static let accent = Color(red: 0.92, green: 0.48, blue: 0.22)
}

@available(iOS 16.1, *)
private func colorFor(_ key: String) -> Color {
    switch key {
    case "green": return Color(hue: 145 / 360, saturation: 0.55, brightness: 0.72)
    case "orange": return EssencesLAStyle.accent
    case "pink": return Color(hue: 335 / 360, saturation: 0.70, brightness: 0.88)
    case "purple": return Color(hue: 265 / 360, saturation: 0.55, brightness: 0.82)
    case "red": return Color(hue: 0 / 360, saturation: 0.70, brightness: 0.85)
    case "teal": return Color(hue: 180 / 360, saturation: 0.55, brightness: 0.70)
    case "gray": return Color(hue: 220 / 360, saturation: 0.08, brightness: 0.65)
    default: return Color(hue: 212 / 360, saturation: 0.75, brightness: 0.85)
    }
}

@available(iOS 16.1, *)
private func headerText(_ locale: String) -> String {
    locale == "ja" ? "まもなくの予定" : "Upcoming"
}

@available(iOS 16.1, *)
private func arrivedText(_ locale: String) -> String {
    locale == "ja" ? "予定時間になりました" : "It's time"
}

@available(iOS 16.1, *)
private func overflowText(_ locale: String, _ n: Int) -> String {
    locale == "ja" ? "ほか\(n)件" : "+\(n) more"
}

/// "1時間2分後" / "1h 2m" — no seconds. Refreshes via TimelineView.
@available(iOS 16.1, *)
private func relativeRemaining(from now: Date, to target: Date, locale: String) -> String {
    let total = max(0, Int(target.timeIntervalSince(now)))
    let hours = total / 3600
    let minutes = (total % 3600) / 60
    if locale == "ja" {
        if total < 60 { return "まもなく" }
        if hours > 0 && minutes > 0 { return "\(hours)時間\(minutes)分後" }
        if hours > 0 { return "\(hours)時間後" }
        return "\(minutes)分後"
    }
    if total < 60 { return "soon" }
    if hours > 0 && minutes > 0 { return "in \(hours)h \(minutes)m" }
    if hours > 0 { return "in \(hours)h" }
    return "in \(minutes)m"
}

@available(iOS 16.1, *)
private struct RelativeOrArrivedLabel: View {
    let target: Date
    let locale: String

    var body: some View {
        TimelineView(.periodic(from: .now, by: 60)) { context in
            let now = context.date
            if now >= target {
                Text(arrivedText(locale))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(EssencesLAStyle.accent)
                    .multilineTextAlignment(.trailing)
            } else {
                Text(relativeRemaining(from: now, to: target, locale: locale))
                    .font(.subheadline.weight(.semibold).monospacedDigit())
                    .foregroundStyle(EssencesLAStyle.accent)
                    .multilineTextAlignment(.trailing)
            }
        }
    }
}

/// Lock Screen presentation only. ActivityConfiguration still requires a
/// `dynamicIsland` trailing closure; we leave it empty (no DI design).
@available(iOS 16.1, *)
struct LockScreenView: View {
    let state: EssencesWidgetAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "calendar")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(EssencesLAStyle.accent)
                Text(headerText(state.locale))
                    .font(.caption.weight(.bold))
                    .foregroundStyle(EssencesLAStyle.muted)
                Spacer(minLength: 0)
            }

            ForEach(Array(state.items.enumerated()), id: \.offset) { _, item in
                HStack(alignment: .center, spacing: 10) {
                    Capsule()
                        .fill(colorFor(item.color))
                        .frame(width: 4, height: 36)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.title)
                            .font(.headline.weight(.semibold))
                            .foregroundStyle(EssencesLAStyle.cream)
                            .lineLimit(1)
                        RelativeOrArrivedLabel(target: item.startDate, locale: state.locale)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    Spacer(minLength: 0)
                }
                .padding(.vertical, 2)
            }

            if state.overflow > 0 {
                Text(overflowText(state.locale, state.overflow))
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(EssencesLAStyle.muted)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(EssencesLAStyle.background)
    }
}

@available(iOS 16.1, *)
struct EssencesWidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: EssencesWidgetAttributes.self) { context in
            LockScreenView(state: context.state)
                .activityBackgroundTint(EssencesLAStyle.background)
                .activitySystemActionForegroundColor(EssencesLAStyle.cream)
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
