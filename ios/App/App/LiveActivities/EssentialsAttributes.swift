import Foundation
import ActivityKit

/// Shared Live Activity definition. Compiled into BOTH the app target
/// (start/update/end) and the widget extension (Lock Screen presentation).
///
/// System limits (Apple): active ≤ ~8h; Lock Screen may linger ≤ ~12h total.
/// App deployment target is iOS 17.2+ (push-to-start). JS clamps leads to 8h.
@available(iOS 16.1, *)
public struct EssencesWidgetAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// Up to 3 upcoming events, soonest first.
        public var items: [Item]
        /// Additional events hidden beyond the shown ones.
        public var overflow: Int
        /// UI language, synced with the in-app language setting ("en" | "ja").
        public var locale: String
        /// Bumped by the app (or remote update push) to force Lock Screen redraw.
        public var tick: Int
        /// "countdown" | "arrived" — flipped at event start (local work item or push).
        public var phase: String

        public init(items: [Item], overflow: Int, locale: String, tick: Int = 0, phase: String = "countdown") {
            self.items = items
            self.overflow = overflow
            self.locale = locale
            self.tick = tick
            self.phase = phase
        }

        /// Accept older payloads that omit `tick` / `phase` (FCM / prior builds).
        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            items = try c.decode([Item].self, forKey: .items)
            overflow = try c.decode(Int.self, forKey: .overflow)
            locale = try c.decode(String.self, forKey: .locale)
            tick = try c.decodeIfPresent(Int.self, forKey: .tick) ?? 0
            phase = try c.decodeIfPresent(String.self, forKey: .phase) ?? "countdown"
        }
    }

    public struct Item: Codable, Hashable {
        public var title: String
        /// Event start time as epoch milliseconds (used for the countdown).
        public var startEpochMs: Double
        /// Color token key (blue/green/orange/pink/purple/red/teal/gray).
        public var color: String
        /// Server/app-baked Lock Screen copy ("3分後" / "予定時間になりました").
        /// Preferred over TimelineView so kill-path FCM updates always change text.
        public var statusText: String

        public init(title: String, startEpochMs: Double, color: String, statusText: String = "") {
            self.title = title
            self.startEpochMs = startEpochMs
            self.color = color
            self.statusText = statusText
        }

        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            title = try c.decode(String.self, forKey: .title)
            startEpochMs = try c.decode(Double.self, forKey: .startEpochMs)
            color = try c.decode(String.self, forKey: .color)
            statusText = try c.decodeIfPresent(String.self, forKey: .statusText) ?? ""
        }

        public var startDate: Date {
            Date(timeIntervalSince1970: startEpochMs / 1000.0)
        }
    }

    public var name: String

    public init(name: String = "Essences") {
        self.name = name
    }

    /// Same copy rules as Cloud Functions `formatLaStatusText` / JS helper.
    public static func statusText(startEpochMs: Double, locale: String, now: Date = Date()) -> String {
        let secs = startEpochMs / 1000.0 - now.timeIntervalSince1970
        let ja = locale != "en"
        if secs <= 0 {
            return ja ? "予定時間になりました" : "It's time"
        }
        if secs < 60 {
            return ja ? "まもなく" : "soon"
        }
        let totalMinutes = Int(secs / 60)
        let hours = totalMinutes / 60
        let minutes = totalMinutes % 60
        if ja {
            if hours > 0 && minutes > 0 { return "\(hours)時間\(minutes)分後" }
            if hours > 0 { return "\(hours)時間後" }
            return "\(totalMinutes)分後"
        }
        if hours > 0 && minutes > 0 { return "in \(hours)h \(minutes)m" }
        if hours > 0 { return "in \(hours)h" }
        return "in \(totalMinutes)m"
    }
}
