import SwiftUI

struct PlanningShell: View {
    @EnvironmentObject private var navigation: TabNavigationState
    @StateObject private var session = PlanningSession()
    @State private var didRestore = false

    var body: some View {
        VStack(spacing: 0) {
            PlanningHeader(
                onPostpone: { navigation.path.append(PlanningRoute.postponeBox) },
                onHelp: { navigation.path.append(PlanningRoute.help) },
                onUser: {}
            )
            HStack(alignment: .top, spacing: 0) {
                PlanningSectionPage(session: session)
                PlanningIndex(session: session)
            }
        }
        .background(PlanningPalette.paper)
        .planningKeyboardDismiss()
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
    let onPostpone: () -> Void
    let onHelp: () -> Void
    let onUser: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 8) {
            Text("Planning")
                .font(.largeTitle.bold())
                .foregroundStyle(PlanningPalette.ink)
            Spacer(minLength: 8)
            NativeGlassIconButton(icon: .postpone, accessibilityLabel: "Postpone Box", action: onPostpone)
            NativeGlassIconButton(icon: .help, accessibilityLabel: "Planning help", action: onHelp)
            NativeGlassIconButton(icon: .user, accessibilityLabel: "User", action: onUser)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PlanningPalette.paper)
    }
}

private struct PlanningIndex: View {
    @ObservedObject var session: PlanningSession

    var body: some View {
        ZStack(alignment: .leading) {
            Rectangle()
                .fill(PlanningPalette.rail)
                .frame(width: 2)
                .frame(maxHeight: .infinity)
                .allowsHitTesting(false)
            tabColumn
        }
    }

    private var tabColumn: some View {
        VStack(spacing: 2) {
            ForEach(session.index) { section in
                Button {
                    session.select(section)
                } label: {
                    ZStack(alignment: .topTrailing) {
                        Text(section.indexTitle)
                            .font(.system(size: 11, weight: session.section == section ? .bold : .medium))
                            .foregroundStyle(PlanningPalette.ink)
                            .lineLimit(1)
                            .fixedSize()
                            .rotationEffect(.degrees(90))
                            .frame(width: 31, height: 90)
                            .background(indexBackground(section), in: PlanningIndexTabShape())
                            .overlay {
                                PlanningIndexTabShape()
                                    .stroke(session.section == section ? indexOutline(section) : Color.clear, lineWidth: 1.5)
                                    .mask {
                                        HStack(spacing: 0) {
                                            Color.clear.frame(width: 3)
                                            Rectangle()
                                        }
                                    }
                            }
                        let count = session.badgeCount(for: section)
                        if count > 0 {
                            Text(count > 99 ? "99" : "\(count)")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundStyle(Color.white)
                                .padding(.horizontal, 4)
                                .frame(minWidth: 16, minHeight: 16)
                                .background(Color.red, in: Capsule())
                                .offset(x: 2, y: -2)
                        }
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel(section.indexTitle)
                .accessibilityAddTraits(session.section == section ? .isSelected : [])
            }
            Spacer(minLength: 0)
        }
        .padding(.top, 2)
        .padding(.trailing, 2)
    }

    private func indexBackground(_ section: PlanningSection) -> Color {
        switch section {
        case .plan: return PlanningPalette.plan
        case .future: return PlanningPalette.future
        case .monthly: return PlanningPalette.monthly
        case .weekly: return PlanningPalette.weekly
        case .daily: return PlanningPalette.daily
        case .plus: return PlanningPalette.plus
        }
    }

    private func indexOutline(_ section: PlanningSection) -> Color {
        switch section {
        case .plan: return Color(red: 0.72, green: 0.45, blue: 0.40)
        case .future: return Color(red: 0.42, green: 0.58, blue: 0.44)
        case .monthly: return Color(red: 0.42, green: 0.52, blue: 0.68)
        case .weekly: return Color(red: 0.68, green: 0.55, blue: 0.36)
        case .daily: return Color(red: 0.70, green: 0.48, blue: 0.40)
        case .plus: return Color(red: 0.58, green: 0.50, blue: 0.42)
        }
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
                    navigation.pop()
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
        .background(PlanningPalette.paper)
        .navigationBarHidden(true)
    }
}
