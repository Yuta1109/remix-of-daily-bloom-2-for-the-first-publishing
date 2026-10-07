import SwiftUI

struct PlanningShell: View {
    @EnvironmentObject private var navigation: TabNavigationState
    @StateObject private var session = PlanningSession()
    @State private var didRestore = false

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            PlanningSectionPage(session: session)
            PlanningIndex(session: session)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .planningFixedHeader {
            PlanningHeader(
                onPostpone: { navigation.path.append(PlanningRoute.postponeBox) },
                onHelp: { navigation.path.append(PlanningRoute.help) },
                onUser: {}
            )
        }
        .planningExtendingSurface(PlanningPalette.paper)
        .planningKeyboardDismiss()
        .navigationBarHidden(true)
        .navigationDestination(for: PlanningRoute.self) { route in
            // Every destination receives the navigation object explicitly so that
            // Back buttons can never read a missing EnvironmentObject.
            Group {
                switch route {
                case .help:
                    PlanningHelpPage()
                case .postponeBox:
                    PostponeBoxPage(session: session)
                case .planList:
                    PlanFullListPage(session: session)
                case .planEditor(let id):
                    PlanEditorPage(session: session, planID: id)
                case .planTransfer(let id):
                    PlanTransferSelectionPage(session: session, planID: id)
                case .reflectionSettings:
                    ReflectionSettingsPage(session: session)
                case .weeklySettings:
                    PlanningLinkPlaceholder(session: session, route: route)
                case .reflection(let scope):
                    ReflectionFlowPage(session: session, scope: scope)
                case .reflectionEdit(let scope):
                    ReflectionEditPage(session: session, scope: scope)
                case .reflectionHistory:
                    ReflectionHistoryPage(session: session)
                case .planningMemory(let scope):
                    PlanningMemoryPage(session: session, scope: scope)
                }
            }
            .environmentObject(navigation)
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
        HStack(alignment: .center, spacing: PlanningTokens.Header.buttonStackSpacing) {
            Text("Planning")
                .font(.system(size: PlanningTokens.Header.titleSize, weight: .bold))
                .foregroundStyle(PlanningPalette.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Spacer(minLength: 8)
            HStack(alignment: .center, spacing: PlanningTokens.Header.iconGroupGap) {
                NativeGlassIconButton(icon: .postpone, accessibilityLabel: "Postpone Box", waitsForGlassFeedback: true, action: onPostpone)
                NativeGlassIconButton(icon: .help, accessibilityLabel: "Planning help", waitsForGlassFeedback: true, action: onHelp)
                NativeGlassIconButton(icon: .user, accessibilityLabel: "User", waitsForGlassFeedback: true, action: onUser)
            }
        }
        .padding(.horizontal, PlanningTokens.contentInset)
        .frame(maxWidth: .infinity)
        .frame(height: PlanningTokens.Header.height)
    }
}

private struct PlanningIndex: View {
    @ObservedObject var session: PlanningSession

    private var tabPitch: CGFloat { PlanningTokens.Index.length + PlanningTokens.Index.gap }

    var body: some View {
        // Real z-order: unselected tabs (0) < seam (1) < selected tab (2).
        // Tabs are positioned individually so the seam can sit between layers.
        ZStack(alignment: .topLeading) {
            Rectangle()
                .fill(PlanningPalette.rail)
                .frame(width: PlanningTokens.Index.seamWidth)
                .frame(maxHeight: .infinity)
                .zIndex(1)
                .allowsHitTesting(false)
            ForEach(Array(session.index.enumerated()), id: \.element) { offset, section in
                tab(section)
                    .offset(y: PlanningTokens.Index.topGap + CGFloat(offset) * tabPitch)
                    .zIndex(session.section == section ? 2 : 0)
            }
        }
        .frame(width: PlanningTokens.Index.columnWidth)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(Color.clear)
    }

    private func tab(_ section: PlanningSection) -> some View {
        let selected = session.section == section
        return Button {
            session.select(section)
        } label: {
            ZStack(alignment: .topTrailing) {
                Text(section.indexTitle)
                    .font(.system(size: PlanningTokens.Index.fontSize, weight: .semibold))
                    .foregroundStyle(PlanningPalette.ink)
                    .lineLimit(1)
                    .fixedSize()
                    .rotationEffect(.degrees(90))
                    .frame(width: PlanningTokens.Index.depth, height: PlanningTokens.Index.length)
                    .background(indexBackground(section), in: PlanningIndexTabShape())
                    .overlay {
                        if selected {
                            PlanningIndexTabOutline()
                                .stroke(indexOutline(section), lineWidth: PlanningTokens.Index.outlineWidth)
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
                        .offset(x: -2, y: 2)
                }
            }
            .frame(width: PlanningTokens.Index.depth, height: PlanningTokens.Index.length)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(section.indexTitle)
        .accessibilityAddTraits(selected ? .isSelected : [])
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
        PlanningIndexHost {
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
}

private struct PlanningLinkPlaceholder: View {
    @EnvironmentObject private var navigation: TabNavigationState
    @ObservedObject var session: PlanningSession
    let route: PlanningRoute

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            NativeGlassIconButton(icon: .back, accessibilityLabel: "Back") {
                navigation.pop()
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
        .planningExtendingSurface(PlanningPalette.paper)
        .navigationBarHidden(true)
    }
}
