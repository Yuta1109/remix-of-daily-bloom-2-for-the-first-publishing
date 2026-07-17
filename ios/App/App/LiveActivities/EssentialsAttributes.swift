import Foundation
import ActivityKit

/// Shared Live Activity definition. Compiled into BOTH the app target
/// (start/update/end) and the widget extension (Lock Screen + Dynamic Island).
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

        public init(items: [Item], overflow: Int, locale: String) {
            self.items = items
            self.overflow = overflow
            self.locale = locale
        }
    }

    public struct Item: Codable, Hashable {
        public var title: String
        /// Event start time as epoch milliseconds (used for the countdown).
        public var startEpochMs: Double
        /// Color token key (blue/green/orange/pink/purple/red/teal/gray).
        public var color: String

        public init(title: String, startEpochMs: Double, color: String) {
            self.title = title
            self.startEpochMs = startEpochMs
            self.color = color
        }

        public var startDate: Date {
            Date(timeIntervalSince1970: startEpochMs / 1000.0)
        }
    }

    public var name: String

    public init(name: String = "Essences") {
        self.name = name
    }
}
