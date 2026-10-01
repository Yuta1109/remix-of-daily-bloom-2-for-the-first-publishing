import SwiftUI

struct PlanningShell: View {
    @EnvironmentObject private var navigation: TabNavigationState
    @StateObject private var session = PlanningSession()
    @State private var didRestore = false

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                PlanningHeader(
                    onPostpone: { navigation.path.append(PlanningRoute.postponeBox) },
                    onHelp: { navigation.path.append(PlanningRoute.help) },
                    onUser: {}
                )
                PlanningSectionPage(session: session)
            }
            PlanningIndex(session: session)
        }
        .background(Color(uiColor: .systemBackground))
        .navigationBarHidden(true)
        .navigationDestination(for: PlanningRoute.self) { route in
            switch route {
            case .help:
                PlanningHelpPage()
            case .postponeBox:
                PostponeBoxPage(session: session)
            case .planEditor(let id):
                PlanEditorPage(session: session, planID: id)
            case .reflectionSettings:
                ReflectionSettingsPage(session: session)
            case .weeklySettings:
                PlanningLinkPlaceholder(session: session, route: route)
            case .reflection(let scope):
                ReflectionFlowPage(session: session, scope: scope)
            case .reflectionHistory:
                ReflectionHistoryPage(session: session)
            }
        }
        .onAppear {
            guard !didRestore else { return }
            session.restore(from: navigation)
            didRestore = true
        }
        .onChange(of: session.section) { _, _ in session.persist(into: navigation) }
        .onChange(of: session.selectedYear) { _, _ in session.persist(into: navigation) }
        .onChange(of: session.weeklyEnabled) { _, _ in session.persist(into: navigation) }
        .onChange(of: session.monthlyPeriodKey) { _, _ in session.persist(into: navigation) }
        .onChange(of: session.weeklyPeriodKey) { _, _ in session.persist(into: navigation) }
        .onChange(of: session.dailyPeriodKey) { _, _ in session.persist(into: navigation) }
    }
}

private struct PlanningHeader: View {
    @Environment(\.colorScheme) private var colorScheme

    let onPostpone: () -> Void
    let onHelp: () -> Void
    let onUser: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 8) {
            Text("Planning")
                .font(.largeTitle.bold())
                .foregroundStyle(Color.primary)
            Spacer(minLength: 8)
            NativeGlassIconButton(icon: .postpone, accessibilityLabel: "Postpone Box", action: onPostpone)
            NativeGlassIconButton(icon: .help, accessibilityLabel: "Planning help", action: onHelp)
            NativeGlassIconButton(icon: .user, accessibilityLabel: "User", action: onUser)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(colorScheme == .dark ? Color.black : Color.white)
    }
}

private struct PlanningIndex: View {
    @ObservedObject var session: PlanningSession
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(spacing: 6) {
            ForEach(session.index) { section in
                Button {
                    session.select(section)
                } label: {
                    ZStack(alignment: .topTrailing) {
                        Text(section.indexTitle)
                            .font(.system(size: 11, weight: session.section == section ? .bold : .medium))
                            .foregroundStyle(session.section == section ? Color(uiColor: .systemBackground) : Color.primary)
                            .frame(width: 62, height: 36)
                            .background(indexBackground(section), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                        let count = session.badgeCount(for: section)
                        if count > 0 {
                            Text(count > 99 ? "99" : "\(count)")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundStyle(Color.white)
                                .padding(.horizontal, 4)
                                .frame(minWidth: 16, minHeight: 16)
                                .background(Color.red, in: Capsule())
                                .offset(x: 4, y: -4)
                        }
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel(section.indexTitle)
                .accessibilityAddTraits(session.section == section ? .isSelected : [])
            }
            Spacer(minLength: 0)
        }
        .padding(.top, 12)
        .padding(.trailing, 8)
        .background(colorScheme == .dark ? Color.black : Color.white)
    }

    private func indexBackground(_ section: PlanningSection) -> Color {
        if session.section == section {
            return Color.primary
        }
        let family: Color
        switch section {
        case .plan: family = Color.primary
        case .future: family = Color.blue
        case .monthly: family = Color.teal
        case .weekly: family = Color.orange
        case .daily: family = Color.pink
        case .plus: family = Color.secondary
        }
        return family.opacity(colorScheme == .dark ? 0.28 : 0.16)
    }
}

private struct PlanningSectionPage: View {
    @ObservedObject var session: PlanningSession

    var body: some View {
        switch session.section {
        case .plan:
            PlanListPage(session: session)
        case .future:
            FutureYearPage(session: session)
        case .plus:
            Text("次回のアップデートをお楽しみに")
                .font(.body)
                .foregroundStyle(Color.primary)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(24)
        case .monthly:
            PeriodPlannerPage(session: session, bucket: .monthly)
        case .weekly:
            PeriodPlannerPage(session: session, bucket: .weekly)
        case .daily:
            PeriodPlannerPage(session: session, bucket: .daily)
        }
    }
}

private struct PlanningLinkPlaceholder: View {
    @EnvironmentObject private var navigation: TabNavigationState
    @ObservedObject var session: PlanningSession
    let route: PlanningRoute

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            NativeGlassIconButton(icon: .back, accessibilityLabel: "Back") {
                if !navigation.path.isEmpty {
                    navigation.path.removeLast()
                }
            }
            Text(route == .weeklySettings ? "Weekly Settings" : "Reflection Settings")
                .font(.title2.bold())
            if route == .weeklySettings {
                Button("Weeklyを無効にする") {
                    session.setWeeklyEnabled(false)
                }
                .buttonStyle(.bordered)
            }
            Spacer()
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Color(uiColor: .systemBackground))
        .navigationBarHidden(true)
    }
}
