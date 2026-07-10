import Foundation
import ActivityKit

/// Shared Live Activity definition. This file is compiled into BOTH the app
/// target (to start/update/end activities) and the widget extension (to render
/// them on the Lock Screen).
@available(iOS 16.1, *)
public struct EssentialsWidgetAttributes: ActivityAttributes {
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
        /// Event start time as epoch milliseconds.
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

    public init(name: String = "Essentials") {
        self.name = name
    }
}
