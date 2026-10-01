import SwiftUI

struct PlanningRootView: View {
    var body: some View { PlanningShell() }
}

struct TodayRootView: View {
    var body: some View { NativeFeaturePlaceholder(tab: .today) }
}

struct CalendarRootView: View {
    var body: some View { NativeFeaturePlaceholder(tab: .calendar) }
}

struct ProgressRootView: View {
    var body: some View { NativeFeaturePlaceholder(tab: .progress) }
}

struct NotesRootView: View {
    var body: some View { NativeFeaturePlaceholder(tab: .notes) }
}

@ViewBuilder
func nativeFeatureRoot(for tab: AppTab) -> some View {
    switch tab {
    case .planning: PlanningRootView()
    case .today: TodayRootView()
    case .calendar: CalendarRootView()
    case .progress: ProgressRootView()
    case .notes: NotesRootView()
    }
}
