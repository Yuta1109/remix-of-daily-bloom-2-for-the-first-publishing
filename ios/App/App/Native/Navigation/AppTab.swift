import SwiftUI

enum AppTab: String, CaseIterable, Codable, Hashable, Identifiable {
    case planning
    case today
    case calendar
    case progress
    case notes

    var id: String { rawValue }

    var title: LocalizedStringKey {
        switch self {
        case .planning: "Planning"
        case .today: "Today"
        case .calendar: "Calendar"
        case .progress: "Progress"
        case .notes: "Notes"
        }
    }

    var systemImage: String {
        switch self {
        case .planning: "square.grid.2x2"
        case .today: "checkmark.circle"
        case .calendar: "calendar"
        case .progress: "chart.bar"
        case .notes: "note.text"
        }
    }
}

struct AppTabConfiguration: Equatable {
    var order: [AppTab]
    var launchTab: AppTab

    static let standard = AppTabConfiguration(
        order: [.planning, .today, .calendar, .progress, .notes],
        launchTab: .planning
    )

    init(order: [AppTab], launchTab: AppTab) {
        let validOrder = order.reduce(into: [AppTab]()) { result, tab in
            if !result.contains(tab) { result.append(tab) }
        }
        self.order = validOrder + AppTab.allCases.filter { !validOrder.contains($0) }
        self.launchTab = self.order.contains(launchTab) ? launchTab : .planning
    }
}
