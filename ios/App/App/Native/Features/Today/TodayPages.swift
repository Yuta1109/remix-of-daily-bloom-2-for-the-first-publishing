import SwiftUI

struct TodayRootView: View {
    @EnvironmentObject private var session: PlanningSession
    @EnvironmentObject private var navigation: TabNavigationState
    @EnvironmentObject private var appState: AppState
    @Environment(\.scenePhase) private var scenePhase
    @State private var showingMenu = false
    @State private var creatingTask = false
    @State private var creatingMemo = false
    @State private var editingTask: UUID?
    @State private var editingMemo: QuickMemo?
    @State private var showingPast = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 15) {
                routineCard
                taskCard
                memoCard
            }
            .padding(.horizontal, PlanningTokens.contentInset)
            .padding(.top, 22)
            .padding(.bottom, 96)
        }
        .planningScroll()
        .planningFixedHeader {
            todayHeader
        }
        .planningExtendingSurface(PlanningPalette.paper)
        .navigationBarHidden(true)
        .overlay {
            if showingMenu {
                Color.black.opacity(0.001)
                    .ignoresSafeArea()
                    .onTapGesture { showingMenu = false }
            }
        }
        .overlay(alignment: .bottomTrailing) {
            TodayAddControl(showingMenu: $showingMenu, onTask: {
                showingMenu = false
                creatingTask = true
            }, onMemo: {
                showingMenu = false
                creatingMemo = true
            })
            .padding(.trailing, 16)
            .padding(.bottom, 14)
        }
        .onAppear { session.refreshTodayStamp() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { session.refreshTodayStamp() }
        }
        .onChange(of: appState.selectedTab) { _, _ in showingMenu = false }
        .onChange(of: navigation.path.count) { _, _ in showingMenu = false }
        .onDisappear { showingMenu = false }
        .sheet(isPresented: $creatingTask) { newTaskSheet }
        .sheet(isPresented: Binding(get: { editingTask != nil }, set: { if !$0 { editingTask = nil } })) {
            if let editingTask { taskEditor(editingTask) }
        }
        .sheet(isPresented: $creatingMemo) { memoSheet(nil) }
        .sheet(item: $editingMemo) { memo in memoSheet(memo) }
        .sheet(isPresented: $showingPast) { TodayPastTasksSheet(session: session) }
        .navigationDestination(for: TodayRoute.self) { route in
            switch route {
            case .routineList:
                TodayRoutineListPage(session: session)
            case .routineDetail(let id):
                TodayRoutineDetailPage(session: session, routineID: id)
            }
        }
    }

    private var todayHeader: some View {
        HStack(alignment: .center, spacing: PlanningTokens.Header.buttonStackSpacing) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Today")
                    .font(.system(size: PlanningTokens.Header.titleSize, weight: .bold))
                    .foregroundStyle(PlanningPalette.ink)
                    .lineLimit(1)
                Text(PeriodCalendar.label(bucket: .daily, key: session.todayStamp))
                    .font(.system(size: 15.5))
                    .foregroundStyle(PlanningPalette.muted)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            HStack(alignment: .center, spacing: PlanningTokens.Header.iconGroupGap) {
                NativeGlassIconButton(icon: .clock, accessibilityLabel: "過去のタスク") { showingPast = true }
                NativeGlassIconButton(icon: .user, accessibilityLabel: "User") {}
            }
        }
        .padding(.horizontal, PlanningTokens.contentInset)
        .frame(maxWidth: .infinity)
        .frame(height: PlanningTokens.Header.height + 30)
    }

    private var routineCard: some View {
        TodaySectionCard(title: "ルーティン", symbol: "sun.max.fill", tint: PlanningPalette.accent, showsChevron: false, expanded: $session.todayRoutineExpanded, trailing: {
            Button("一覧を見る") {
                PlanningTransition.perform { navigation.path.append(TodayRoute.routineList) }
            }
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(PlanningPalette.accent)
            .buttonStyle(.plain)
        }) {
            ForEach(session.visibleRoutines()) { routine in
                HStack(alignment: .center, spacing: 8) {
                    Button {
                        session.toggleRoutine(routine, dayKey: session.todayStamp)
                        PlanningHaptics.selection()
                    } label: {
                        PeriodListCheckbox(square: true, completed: session.routineCompleted(routine, dayKey: session.todayStamp))
                            .frame(width: PlanningTokens.PeriodBody.checkboxColumn, height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    Button {
                        navigation.path.append(TodayRoute.routineDetail(routine.id))
                    } label: {
                        HStack(alignment: .center, spacing: 8) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(routine.title)
                                    .font(.system(size: 16, weight: .semibold))
                                    .foregroundStyle(PlanningPalette.ink)
                                    .lineLimit(2)
                                Text(TodayFormatting.weekdays(routine))
                                    .font(.system(size: 13))
                                    .foregroundStyle(PlanningPalette.muted)
                                Text(TodayFormatting.time(routine))
                                    .font(.system(size: 13))
                                    .foregroundStyle(PlanningPalette.muted)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            PlanningCategoryIconBubble(symbol: routine.iconSymbol, colorID: PlanIconColor.peach.rawValue)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var taskCard: some View {
        TodaySectionCard(title: "今日のタスク", symbol: "checkmark.circle.fill", tint: Color(red: 0.45, green: 0.72, blue: 0.55), showsChevron: true, expanded: $session.todayTasksExpanded, trailing: { EmptyView() }) {
            PlanningPeriodTaskList(nodes: session.todayTasks(), periodKey: session.todayStamp, bucket: .daily) { nodeID in
                guard let node = session.findNode(nodeID) else { return }
                if session.setCompleted(nodeID: nodeID, completed: !node.completed) {
                    PlanningHaptics.selection()
                }
            } onOpen: { nodeID in
                editingTask = nodeID
            }
        }
    }

    private var memoCard: some View {
        TodaySectionCard(title: "クイックメモ", symbol: "pencil", tint: Color(red: 0.36, green: 0.62, blue: 0.52), showsChevron: true, expanded: $session.todayMemosExpanded, trailing: { EmptyView() }) {
            ForEach(session.quickMemos) { memo in
                Button { editingMemo = memo } label: {
                    HStack(alignment: .center, spacing: 10) {
                        PlanningCategoryIconBubble(symbol: memo.iconSymbol, colorID: memo.colorID, diameter: 42)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(memo.text)
                                .font(.system(size: 16))
                                .foregroundStyle(PlanningPalette.ink)
                                .lineLimit(2)
                                .multilineTextAlignment(.leading)
                            Text("\(TodayFormatting.addedTimeLabel) \(TodayFormatting.clock(memo.createdAt))")
                                .font(.system(size: 12.5))
                                .foregroundStyle(PlanningPalette.muted)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var newTaskSheet: some View {
        PlanningItemEditorSheet(draft: PlanningItemDraft(), isNew: true, bucket: .daily, kind: .task, periodKey: session.todayStamp) { draft in
            session.saveItem(existingID: nil, draft: draft, bucket: .daily, kind: .task, periodKey: session.todayStamp)
            creatingTask = false
        } onClose: { creatingTask = false }
    }

    @ViewBuilder
    private func taskEditor(_ id: UUID) -> some View {
        if let node = session.findNode(id) {
            PlanningItemEditorSheet(draft: PlanningItemDraft(node: node), isNew: false, bucket: node.bucket, kind: .task, periodKey: node.periodKey, onDelete: {
                session.deleteLiveItem(id)
                editingTask = nil
            }) { draft in
                session.saveItem(existingID: id, draft: draft, bucket: node.bucket, kind: .task, periodKey: node.periodKey)
                editingTask = nil
            } onClose: { editingTask = nil }
        }
    }

    private func memoSheet(_ memo: QuickMemo?) -> some View {
        TodayMemoSheet(memo: memo) { next, isNew in
            session.saveMemo(next, isNew: isNew)
            creatingMemo = false
            editingMemo = nil
        } onDelete: { id in
            session.deleteMemo(id)
            editingMemo = nil
        } onClose: {
            creatingMemo = false
            editingMemo = nil
        }
    }
}

enum TodayRoute: Hashable {
    case routineList
    case routineDetail(UUID)
}

struct TodaySectionCard<Trailing: View, Content: View>: View {
    let title: String
    let symbol: String
    let tint: Color
    let showsChevron: Bool
    @Binding var expanded: Bool
    @ViewBuilder var trailing: () -> Trailing
    @ViewBuilder var content: () -> Content

    init(title: String, symbol: String, tint: Color, showsChevron: Bool, expanded: Binding<Bool>, @ViewBuilder trailing: @escaping () -> Trailing, @ViewBuilder content: @escaping () -> Content) {
        self.title = title
        self.symbol = symbol
        self.tint = tint
        self.showsChevron = showsChevron
        self._expanded = expanded
        self.trailing = trailing
        self.content = content
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) { expanded.toggle() }
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: symbol)
                            .font(.system(size: 22))
                            .foregroundStyle(tint)
                            .frame(width: 26, height: 26)
                        Text(title)
                            .font(.system(size: 20, weight: .bold))
                            .foregroundStyle(PlanningPalette.ink)
                        Spacer(minLength: 0)
                        if showsChevron {
                            Image(systemName: expanded ? "chevron.up" : "chevron.down")
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(PlanningPalette.muted)
                        }
                    }
                    .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                trailing()
            }
            if expanded { content() }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 21, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 21, style: .continuous).stroke(PlanningPalette.line, lineWidth: 0.8))
        .shadow(color: PlanningPalette.ink.opacity(0.04), radius: 8, y: 3)
    }
}

struct TodayIconBadge: View {
    let symbol: String
    let tint: Color
    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(tint)
            .frame(width: 36, height: 36)
            .background(tint.opacity(0.14), in: Circle())
    }
}

enum TodayFormatting {
    static func weekdays(_ routine: RoutineDefinition) -> String {
        if routine.everyDay { return "毎日" }
        let order = [2, 3, 4, 5, 6, 7, 1]
        let labels = [2: "月", 3: "火", 4: "水", 5: "木", 6: "金", 7: "土", 1: "日"]
        return order.filter { routine.weekdays.contains($0) }.compactMap { labels[$0] }.joined(separator: "・")
    }

    static func time(_ routine: RoutineDefinition) -> String {
        switch routine.timeMode {
        case .anytime: return "随時"
        case .clock: return clock(routine.startMinutes ?? 0)
        case .range: return "\(clock(routine.startMinutes ?? 0))〜\(clock(routine.endMinutes ?? 0))"
        }
    }

    static func clock(_ minutes: Int) -> String {
        String(format: "%02d:%02d", minutes / 60, minutes % 60)
    }

    static func clock(_ date: Date) -> String {
        let parts = PeriodCalendar.calendar.dateComponents([.hour, .minute], from: date)
        return clock((parts.hour ?? 0) * 60 + (parts.minute ?? 0))
    }

    static func span(_ start: Date, _ end: Date) -> String {
        let calendar = PeriodCalendar.calendar
        let startMonth = calendar.component(.month, from: start)
        let startDay = calendar.component(.day, from: start)
        let endMonth = calendar.component(.month, from: end)
        let endDay = calendar.component(.day, from: end)
        if startMonth == endMonth { return "\(startMonth)/\(startDay)-\(endDay)" }
        return "\(startMonth)/\(startDay)-\(endMonth)/\(endDay)"
    }

    static var addedTimeLabel: String {
        let language = Bundle.main.preferredLocalizations.first ?? "ja"
        return language.hasPrefix("en") ? "Added" : "追加時間"
    }
}

struct TodayRoutineListPage: View {
    @ObservedObject var session: PlanningSession
    @EnvironmentObject private var navigation: TabNavigationState
    @State private var creating = false

    var body: some View {
        ScrollView {
            VStack(spacing: 11) {
                ForEach(session.routines) { routine in
                    Button {
                        navigation.path.append(TodayRoute.routineDetail(routine.id))
                    } label: {
                        routineCard(routine)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, PlanningTokens.contentInset)
            .padding(.top, 12)
            .padding(.bottom, 96)
        }
        .planningScroll()
        .planningExtendingSurface(PlanningPalette.paper)
        .planningPageChrome(title: "ルーティン一覧", onBack: { navigation.pop() }) {
            NativeGlassIconButton(icon: .user, accessibilityLabel: "User") {}
        }
        .overlay(alignment: .bottomTrailing) {
            TodayFixedAddButton(accessibilityLabel: "ルーティンを追加") { creating = true }
                .padding(.trailing, 16)
                .padding(.bottom, 14)
        }
        .sheet(isPresented: $creating) {
            TodayRoutineSheet(routine: nil) { routine in
                session.saveRoutine(routine, isNew: true)
                creating = false
            } onDelete: { _ in } onClose: { creating = false }
        }
    }

    private func routineCard(_ routine: RoutineDefinition) -> some View {
        HStack(alignment: .center, spacing: 12) {
            RoutineSymbolBadge(symbol: routine.iconSymbol, diameter: 63)
            VStack(alignment: .leading, spacing: 4) {
                Text(routine.title)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(PlanningPalette.ink)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                Text(TodayFormatting.weekdays(routine))
                    .font(.system(size: 14))
                    .foregroundStyle(PlanningPalette.muted)
                HStack(spacing: 4) {
                    Image(systemName: "clock").font(.system(size: 12, weight: .medium))
                    Text(TodayFormatting.time(routine)).font(.system(size: 14))
                }
                .foregroundStyle(PlanningPalette.muted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            TodayRateRing(rate: session.routineMonthRate(routine))
            Image(systemName: "chevron.right")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(PlanningPalette.muted)
                .frame(width: 16)
        }
        .frame(maxWidth: .infinity, minHeight: 76, alignment: .leading)
        .routineSurface(radius: 15)
    }
}

struct TodayRateRing: View {
    let rate: Int
    var body: some View {
        ZStack {
            Circle().stroke(RoutineAchievementColor.neutral, lineWidth: 6)
            if rate > 0 {
                Circle().trim(from: 0, to: CGFloat(rate) / 100)
                    .stroke(RoutineAchievementColor.color(percent: rate), style: StrokeStyle(lineWidth: 6, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            }
            Text("\(rate)%")
                .font(.system(size: 15, weight: .semibold).monospacedDigit())
                .foregroundStyle(PlanningPalette.ink)
                .minimumScaleFactor(0.7)
                .lineLimit(1)
                .frame(width: 46)
        }
        .frame(width: 62, height: 62)
    }
}

struct TodayRoutineDetailPage: View {
    @ObservedObject var session: PlanningSession
    @EnvironmentObject private var navigation: TabNavigationState
    let routineID: UUID
    @State private var editing = false

    private var routine: RoutineDefinition? { session.routines.first { $0.id == routineID } }

    var body: some View {
        ScrollView {
            if let routine {
                VStack(alignment: .leading, spacing: 14) {
                    summaryCard(routine)
                    monthCard(routine)
                    monthChart(routine)
                    weekCard(routine)
                }
                .padding(.horizontal, PlanningTokens.contentInset)
                .padding(.top, 12)
                .padding(.bottom, 24)
            }
        }
        .planningScroll()
        .planningExtendingSurface(PlanningPalette.paper)
        .planningPageChrome(title: "ルーティンの詳細", onBack: { navigation.pop() })
        .sheet(isPresented: $editing) {
            if let routine {
                TodayRoutineSheet(routine: routine) { next in
                    session.saveRoutine(next, isNew: false)
                    editing = false
                } onDelete: { id in
                    session.deleteRoutine(id)
                    editing = false
                    navigation.pop()
                } onClose: { editing = false }
            }
        }
    }

    private func summaryCard(_ routine: RoutineDefinition) -> some View {
        HStack(spacing: 12) {
            RoutineSymbolBadge(symbol: routine.iconSymbol, diameter: 60)
            VStack(alignment: .leading, spacing: 4) {
                Text(routine.title)
                    .font(.system(size: 19, weight: .semibold))
                    .foregroundStyle(PlanningPalette.ink)
                    .lineLimit(2)
                Text("\(TodayFormatting.weekdays(routine)) · \(TodayFormatting.time(routine))")
                    .font(.system(size: 14))
                    .foregroundStyle(PlanningPalette.muted)
                    .lineLimit(2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Button("編集") { editing = true }
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(RoutineAchievementColor.blue)
                .frame(minWidth: 64, minHeight: 36)
                .background(Color(red: 0.929, green: 0.961, blue: 1), in: Capsule())
                .frame(minHeight: 44)
        }
        .frame(minHeight: 88)
        .routineSurface(radius: 16)
    }

    private func monthCard(_ routine: RoutineDefinition) -> some View {
        let rate = session.routineMonthRate(routine)
        let elapsed = TodayAchievement.elapsedDayCount(monthContaining: Date())
        let achieved = session.achievedDayCount(routine)
        return VStack(alignment: .leading, spacing: 12) {
            Text("今月の達成率").font(.system(size: 16, weight: .semibold)).foregroundStyle(PlanningPalette.ink)
            HStack(alignment: .center, spacing: 14) {
                Text("\(rate)%")
                    .font(.system(size: 46, weight: .bold).monospacedDigit())
                    .foregroundStyle(PlanningPalette.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .frame(minWidth: 108, alignment: .leading)
                VStack(alignment: .trailing, spacing: 8) {
                    Capsule()
                        .fill(RoutineAchievementColor.neutral)
                        .frame(height: 13)
                        .overlay(alignment: .leading) {
                            if rate > 0 {
                                Capsule()
                                    .fill(RoutineAchievementColor.color(percent: rate))
                                    .frame(maxWidth: .infinity)
                                    .scaleEffect(x: CGFloat(rate) / 100, y: 1, anchor: .leading)
                            }
                        }
                    Text("\(achieved) / \(elapsed) 日")
                        .font(.system(size: 14))
                        .foregroundStyle(PlanningPalette.muted)
                }
            }
        }
        .routineSurface(radius: 16)
    }

    private func monthChart(_ routine: RoutineDefinition) -> some View {
        let current = PeriodCalendar.currentKey(.monthly)
        let keys = TodayAchievement.monthKeys(endingAt: Date(), count: 6)
        let rows: [(key: String, percent: Int?)] = keys.map { key in
            guard RoutineAchievementTone.monthAvailable(createdAt: routine.createdAt, monthKey: key) else {
                return (key, nil)
            }
            let achieved = session.routineCompletions.filter { $0.routineID == routine.id && $0.dayKey.hasPrefix(key) }.count
            let parts = key.split(separator: "-").compactMap { Int($0) }
            let elapsed = key == current
                ? TodayAchievement.elapsedDayCount(monthContaining: Date())
                : PeriodCalendar.daysInMonth(year: parts.first ?? 2026, month: parts.count > 1 ? parts[1] : 1)
            return (key, TodayAchievement.rate(achieved: achieved, elapsed: elapsed))
        }
        return VStack(alignment: .leading, spacing: 12) {
            routineSectionTitle("月ごとの達成率の変化", trailing: "過去6か月")
            HStack(alignment: .bottom, spacing: 6) {
                VStack {
                    Text("100%")
                    Spacer(minLength: 0)
                    Text("50%")
                    Spacer(minLength: 0)
                    Text("0%")
                }
                .font(.system(size: 11))
                .foregroundStyle(PlanningPalette.muted)
                .frame(width: 36, height: 118, alignment: .trailing)
                HStack(alignment: .bottom, spacing: 6) {
                    ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                        monthColumn(row.key, percent: row.percent, current: row.key == current)
                    }
                }
                .frame(maxWidth: .infinity)
            }
        }
        .routineSurface(radius: 16)
    }

    private func monthColumn(_ key: String, percent: Int?, current: Bool) -> some View {
        VStack(spacing: 6) {
            Text(percent.map { "\($0)%" } ?? "—")
                .font(.system(size: 11, weight: .semibold).monospacedDigit())
                .foregroundStyle(PlanningPalette.muted)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            ZStack(alignment: .bottom) {
                VStack(spacing: 0) {
                    Rectangle().fill(PlanningPalette.line.opacity(0.7)).frame(height: 0.6)
                    Spacer()
                    Rectangle().fill(PlanningPalette.line.opacity(0.7)).frame(height: 0.6)
                    Spacer()
                    Rectangle().fill(PlanningPalette.line.opacity(0.9)).frame(height: 0.8)
                }
                if let percent, percent > 0 {
                    UnevenRoundedRectangle(topLeadingRadius: 5, bottomLeadingRadius: 0, bottomTrailingRadius: 0, topTrailingRadius: 5)
                        .fill(RoutineAchievementColor.color(percent: percent, historical: !current))
                        .frame(height: max(4, 108 * CGFloat(percent) / 100))
                        .padding(.horizontal, 4)
                }
            }
            .frame(height: 108)
            Text(RoutineAchievementTone.monthLabel(key))
                .font(.system(size: 12, weight: current ? .bold : .regular))
                .foregroundStyle(current ? PlanningPalette.ink : PlanningPalette.muted)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity)
    }

    private func weekCard(_ routine: RoutineDefinition) -> some View {
        let achieved = Set(session.routineCompletions.filter { $0.routineID == routine.id }.map(\.dayKey))
        let weeks = TodayAchievement.weeks(monthContaining: Date(), achieved: achieved)
        let month = PeriodCalendar.calendar.component(.month, from: Date())
        return VStack(alignment: .leading, spacing: 12) {
            routineSectionTitle("今月の週ごとの達成状況", trailing: "\(month)月")
            HStack(alignment: .bottom, spacing: weeks.count > 5 ? 4 : 8) {
                ForEach(weeks, id: \.index) { week in
                    let rate = TodayAchievement.rate(achieved: week.achievedDays, elapsed: week.elapsedDays)
                    VStack(spacing: 4) {
                        Text("\(rate)%")
                            .font(.system(size: 13, weight: .semibold).monospacedDigit())
                            .foregroundStyle(PlanningPalette.ink)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                        ZStack(alignment: .bottom) {
                            RoundedRectangle(cornerRadius: 6, style: .continuous)
                                .fill(RoutineAchievementColor.neutral.opacity(0.45))
                            if rate > 0 {
                                RoundedRectangle(cornerRadius: 6, style: .continuous)
                                    .fill(RoutineAchievementColor.color(percent: rate))
                                    .frame(height: 84 * CGFloat(rate) / 100)
                            }
                        }
                        .frame(height: 84)
                        Text("\(week.index)週目")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(PlanningPalette.ink)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                        Text(TodayFormatting.span(week.start, week.end))
                            .font(.system(size: 10))
                            .foregroundStyle(PlanningPalette.muted)
                            .lineLimit(2)
                            .minimumScaleFactor(0.7)
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
        }
        .routineSurface(radius: 16)
    }

    private func routineSectionTitle(_ title: String, trailing: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).font(.system(size: 16, weight: .semibold)).foregroundStyle(PlanningPalette.ink)
            Spacer(minLength: 8)
            Text(trailing).font(.system(size: 13)).foregroundStyle(PlanningPalette.muted)
        }
    }
}

struct TodayRoutineSheet: View {
    @State var draft: RoutineDefinition
    @State private var original: RoutineDefinition
    let isNew: Bool
    let onSave: (RoutineDefinition) -> Void
    let onDelete: (UUID) -> Void
    let onClose: () -> Void
    @State private var editingTime = false
    @State private var showingAllIcons = false

    init(routine: RoutineDefinition?, onSave: @escaping (RoutineDefinition) -> Void, onDelete: @escaping (UUID) -> Void, onClose: @escaping () -> Void) {
        let initial = routine ?? RoutineDefinition(title: "", iconSymbol: "sun.max", everyDay: true, weekdays: [], timeMode: .anytime, startMinutes: nil, endMinutes: nil, isPaused: false, createdAt: Date(), updatedAt: Date())
        _draft = State(initialValue: initial)
        _original = State(initialValue: initial)
        self.isNew = routine == nil
        self.onSave = onSave
        self.onDelete = onDelete
        self.onClose = onClose
    }

    private var canSave: Bool {
        let title = draft.title.trimmingCharacters(in: .whitespacesAndNewlines)
        if title.isEmpty { return false }
        if !draft.everyDay && draft.weekdays.isEmpty { return false }
        if draft.timeMode == .range {
            guard let start = draft.startMinutes, let end = draft.endMinutes, end > start else { return false }
        }
        return true
    }

    private func requestClose() {
        if draft == original {
            onClose()
        } else {
            PlanningDiscardConfirmation.present { onClose() }
        }
    }

    var body: some View {
        PlanningSystemSheetChrome(onClose: requestClose, onConfirm: { if canSave { onSave(draft) } }, confirmEnabled: canSave, centerTitle: isNew ? "ルーティンを追加" : "ルーティンを編集", maximumBody: PlanningTokens.Sheet.maximumBody, bodySurface: .white) {
            VStack(alignment: .leading, spacing: 16) {
                fieldLabel("タイトル")
                TextField("タイトル", text: $draft.title)
                    .font(.system(size: 16.5))
                    .padding(.horizontal, 14)
                    .frame(maxWidth: .infinity)
                    .frame(height: 46)
                    .background(Color(red: 0.957, green: 0.957, blue: 0.969), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(PlanningPalette.line, lineWidth: 1))
                fieldLabel("アイコン")
                iconRow
                fieldLabel("曜日")
                weekdayRow
                fieldLabel("時間")
                Button { editingTime = true } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "clock").foregroundStyle(PlanningPalette.accent)
                        Text(TodayFormatting.time(draft)).foregroundStyle(PlanningPalette.ink)
                        Spacer(minLength: 8)
                        Image(systemName: "chevron.right").foregroundStyle(PlanningPalette.muted)
                    }
                    .padding(.horizontal, 14)
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .background(Color(red: 0.957, green: 0.957, blue: 0.969), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .buttonStyle(.plain)
                fieldLabel("一旦停止")
                HStack(spacing: 10) {
                    Image(systemName: "pause.fill").foregroundStyle(PlanningPalette.muted).frame(width: 22)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("このルーティンを一旦停止する").font(.system(size: 15, weight: .semibold)).foregroundStyle(PlanningPalette.ink)
                        Text("一時停止中は今日の一覧に表示されません").font(.system(size: 12)).foregroundStyle(PlanningPalette.muted)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Toggle("", isOn: $draft.isPaused).labelsHidden()
                }
                .padding(.horizontal, 12)
                .frame(maxWidth: .infinity, minHeight: 68)
                .background(Color(red: 0.957, green: 0.957, blue: 0.969), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                if !isNew {
                    Button {
                        PlanningDiscardConfirmation.presentDestructive(message: PlanningText.string(.postponeDeleteConfirm), destructiveTitle: PlanningText.string(.postponeDelete)) {
                            onDelete(draft.id)
                        }
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "trash")
                            Text(PlanningText.string(.postponeDelete)).font(.system(size: 17, weight: .semibold))
                        }
                        .foregroundStyle(Color(red: 0.75, green: 0.22, blue: 0.18))
                        .frame(maxWidth: .infinity)
                        .frame(height: 52)
                        .background(Color(red: 0.75, green: 0.22, blue: 0.18).opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 10)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .sheet(isPresented: $editingTime) {
            RoutineTimePopup(routine: draft) { mode, start, end in
                draft.timeMode = mode
                draft.startMinutes = start
                draft.endMinutes = end
                editingTime = false
            } onClose: { editingTime = false }
        }
        .sheet(isPresented: $showingAllIcons) {
            PlanningSystemSheetChrome(onClose: { showingAllIcons = false }, onConfirm: { showingAllIcons = false }, centerTitle: "アイコン", bodySurface: Color.white) {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 44), spacing: 8)], spacing: 8) {
                    ForEach(PlanningIconCatalog.symbols, id: \.self) { symbol in
                        iconButton(symbol, diameter: 44)
                    }
                }
                .padding(16)
            }
        }
    }

    private func fieldLabel(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(PlanningPalette.muted)
    }

    private var iconRow: some View {
        let symbols = ["sun.max", "book", "drop.fill", "dumbbell.fill", "moon.fill", "figure.run"]
        return HStack(spacing: 8) {
            ForEach(symbols, id: \.self) { symbol in
                iconButton(symbol, diameter: 44)
            }
            Button { showingAllIcons = true } label: {
                Text("…")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(PlanningPalette.ink)
                    .frame(width: 44, height: 44)
                    .background(Color(uiColor: .secondarySystemBackground), in: Circle())
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func iconButton(_ symbol: String, diameter: CGFloat) -> some View {
        let tint = RoutineIconTint.color(for: symbol)
        let selected = draft.iconSymbol == symbol
        return Button { draft.iconSymbol = symbol } label: {
            Image(systemName: symbol)
                .font(.system(size: diameter * 0.46, weight: .medium))
                .foregroundStyle(tint)
                .frame(width: diameter, height: diameter)
                .background(tint.opacity(0.18), in: Circle())
                .overlay(Circle().stroke(selected ? PlanningPalette.accent : Color.clear, lineWidth: 2))
        }
        .buttonStyle(.plain)
    }

    private var weekdayRow: some View {
        let labels = [(0, "毎日"), (2, "月"), (3, "火"), (4, "水"), (5, "木"), (6, "金"), (7, "土"), (1, "日")]
        return HStack(spacing: 4) {
            ForEach(labels, id: \.0) { item in
                let selected = item.0 == 0 ? draft.everyDay : draft.weekdays.contains(item.0)
                Button {
                    let choice: TodayWeekChoice = item.0 == 0 ? .everyDay : .weekday(item.0)
                    let next = TodayAchievement.applyWeekday(everyDay: draft.everyDay, days: draft.weekdays, choice: choice)
                    draft.everyDay = next.everyDay
                    draft.weekdays = next.days
                } label: {
                    Text(item.1)
                        .font(.system(size: item.0 == 0 ? 13 : 14, weight: .semibold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .foregroundStyle(selected ? Color.white : PlanningPalette.ink)
                        .frame(maxWidth: .infinity, minHeight: 36)
                        .background(selected ? PlanningPalette.accent : Color(uiColor: .secondarySystemBackground), in: Capsule())
                }
                .buttonStyle(.plain)
            }
        }
    }
}

private extension View {
    func routineSurface(radius: CGFloat) -> some View {
        padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).stroke(PlanningPalette.line, lineWidth: 0.7))
            .shadow(color: PlanningPalette.ink.opacity(0.04), radius: 6, y: 2)
    }
}

struct RoutineSymbolBadge: View {
    let symbol: String
    var diameter: CGFloat = 63

    var body: some View {
        let tint = RoutineIconTint.color(for: symbol)
        Image(systemName: symbol)
            .font(.system(size: diameter * 0.48, weight: .medium))
            .foregroundStyle(tint)
            .frame(width: diameter, height: diameter)
            .background(tint.opacity(0.18), in: Circle())
    }
}

enum RoutineIconTint {
    static func color(for symbol: String) -> Color {
        switch symbol {
        case "sun.max", "sun.max.fill":
            return Color(red: 0.95, green: 0.62, blue: 0.28)
        case "book", "book.fill":
            return Color(red: 0.35, green: 0.55, blue: 0.95)
        case "drop.fill", "cup.and.saucer", "waterbottle":
            return Color(red: 0.35, green: 0.70, blue: 0.95)
        case "dumbbell", "dumbbell.fill", "figure.strengthtraining.traditional":
            return Color(red: 0.55, green: 0.40, blue: 0.85)
        case "moon", "moon.fill", "bed.double":
            return Color(red: 0.95, green: 0.72, blue: 0.35)
        case "figure.run":
            return PlanIconColor.peach.color
        default:
            return PlanIconColor.sky.color
        }
    }
}

enum RoutineAchievementColor {
    static let neutral = Color(red: 0.847, green: 0.816, blue: 0.761)
    static let blue = Color(red: 0.263, green: 0.529, blue: 0.949)

    static func color(percent: Int, historical: Bool = false) -> Color {
        let base: Color
        switch RoutineAchievementTone.name(for: percent) {
        case "red": base = Color(red: 0.851, green: 0.361, blue: 0.349)
        case "purple": base = Color(red: 0.533, green: 0.400, blue: 0.863)
        case "blue": base = blue
        case "green": base = Color(red: 0.322, green: 0.725, blue: 0.565)
        default: base = neutral
        }
        return historical && percent > 0 ? base.opacity(0.5) : base
    }
}

struct TodayFixedAddButton: View {
    let accessibilityLabel: String
    let action: () -> Void

    var body: some View {
        if #available(iOS 26.0, *) {
            Button(action: action) { mark }
                .buttonStyle(.plain)
                .glassEffect(.regular.tint(PlanningPalette.accent).interactive(), in: Circle())
                .accessibilityLabel(accessibilityLabel)
        } else {
            Button(action: action) {
                mark.background(Circle().fill(PlanningPalette.accent))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(accessibilityLabel)
        }
    }

    private var mark: some View {
        Image(systemName: "plus")
            .font(.system(size: 24, weight: .semibold))
            .foregroundStyle(Color.white)
            .frame(width: 52, height: 52)
            .contentShape(Circle())
    }
}

struct RoutineTimePopup: View {
    let onSave: (RoutineTimeMode, Int?, Int?) -> Void
    let onClose: () -> Void
    @State private var mode: RoutineTimeMode
    @State private var start: Int
    @State private var end: Int
    @State private var startDate = Date()
    @State private var endDate = Date()

    init(routine: RoutineDefinition, onSave: @escaping (RoutineTimeMode, Int?, Int?) -> Void, onClose: @escaping () -> Void) {
        self.onSave = onSave
        self.onClose = onClose
        _mode = State(initialValue: routine.timeMode)
        _start = State(initialValue: routine.startMinutes ?? 7 * 60)
        _end = State(initialValue: routine.endMinutes ?? 8 * 60)
    }

    private var rangeValid: Bool { mode != .range || end > start }

    var body: some View {
        PlanningSystemSheetChrome(
            onClose: onClose,
            onConfirm: commit,
            confirmEnabled: rangeValid,
            centerTitle: "ルーティンの時間",
            maximumBody: mode == .range ? 560 : 420,
            bodySurface: .white
        ) {
            VStack(alignment: .leading, spacing: 14) {
                Picker("時間", selection: $mode) {
                    Text("随時").tag(RoutineTimeMode.anytime)
                    Text("時刻").tag(RoutineTimeMode.clock)
                    Text("時間帯").tag(RoutineTimeMode.range)
                }
                .pickerStyle(.segmented)
                if mode == .anytime {
                    Text("時刻を決めずに、その日のどこかで行います")
                        .font(.system(size: 14))
                        .foregroundStyle(PlanningPalette.muted)
                } else if mode == .clock {
                    DatePicker("時刻", selection: $startDate, displayedComponents: .hourAndMinute)
                        .datePickerStyle(.wheel)
                        .labelsHidden()
                        .environment(\.locale, Locale(identifier: "ja_JP"))
                        .frame(maxWidth: .infinity)
                        .frame(height: 160)
                } else {
                    Text("開始").font(.system(size: 13, weight: .semibold)).foregroundStyle(PlanningPalette.muted)
                    DatePicker("開始", selection: $startDate, displayedComponents: .hourAndMinute)
                        .datePickerStyle(.wheel)
                        .labelsHidden()
                        .environment(\.locale, Locale(identifier: "ja_JP"))
                        .frame(height: 140)
                    Text("終了").font(.system(size: 13, weight: .semibold)).foregroundStyle(PlanningPalette.muted)
                    DatePicker("終了", selection: $endDate, displayedComponents: .hourAndMinute)
                        .datePickerStyle(.wheel)
                        .labelsHidden()
                        .environment(\.locale, Locale(identifier: "ja_JP"))
                        .frame(height: 140)
                    if !rangeValid {
                        Text("終了時刻は開始時刻より後にしてください")
                            .font(.system(size: 13))
                            .foregroundStyle(Color(red: 0.75, green: 0.22, blue: 0.18))
                    }
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .onAppear {
            startDate = Self.date(minutes: start)
            endDate = Self.date(minutes: end)
        }
        .onChange(of: startDate) { _, value in start = Self.minutes(value) }
        .onChange(of: endDate) { _, value in end = Self.minutes(value) }
    }

    private func commit() {
        guard rangeValid else {
            PlanningDiscardConfirmation.presentMessage("終了時刻は開始時刻より後にしてください")
            return
        }
        switch mode {
        case .anytime:
            onSave(.anytime, nil, nil)
        case .clock:
            onSave(.clock, start, nil)
        case .range:
            onSave(.range, start, end)
        }
    }

    private static func date(minutes: Int) -> Date {
        var parts = PeriodCalendar.calendar.dateComponents([.year, .month, .day], from: Date())
        parts.hour = minutes / 60
        parts.minute = minutes % 60
        return PeriodCalendar.calendar.date(from: parts) ?? Date()
    }

    private static func minutes(_ date: Date) -> Int {
        let parts = PeriodCalendar.calendar.dateComponents([.hour, .minute], from: date)
        return (parts.hour ?? 0) * 60 + (parts.minute ?? 0)
    }
}

struct TodayMemoSheet: View {
    @State var draft: QuickMemo
    let isNew: Bool
    let onSave: (QuickMemo, Bool) -> Void
    let onDelete: (UUID) -> Void
    let onClose: () -> Void

    init(memo: QuickMemo?, onSave: @escaping (QuickMemo, Bool) -> Void, onDelete: @escaping (UUID) -> Void, onClose: @escaping () -> Void) {
        let now = Date()
        let minutes = Calendar.current.component(.hour, from: now) * 60 + Calendar.current.component(.minute, from: now)
        let initial = memo ?? QuickMemo(text: "", minutes: minutes, iconSymbol: "note.text", createdAt: now, dayKey: PeriodCalendar.dayKey(now))
        _draft = State(initialValue: initial)
        self.isNew = memo == nil
        self.onSave = onSave
        self.onDelete = onDelete
        self.onClose = onClose
    }

    var body: some View {
        PlanningSystemSheetChrome(onClose: onClose, onConfirm: { onSave(draft, isNew) }, confirmEnabled: !draft.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, centerTitle: isNew ? "クイックメモを追加" : "クイックメモを編集", maximumBody: PlanningTokens.Sheet.maximumBody, bodySurface: .white) {
            VStack(alignment: .leading, spacing: 16) {
                TextField("メモ", text: $draft.text, axis: .vertical)
                    .lineLimit(4...12)
                    .font(.system(size: 16.5))
                    .padding(12)
                    .frame(maxWidth: .infinity, minHeight: 116, alignment: .topLeading)
                    .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 13, style: .continuous))
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(PlanningIconCatalog.symbols, id: \.self) { symbol in
                            Button { draft.iconSymbol = symbol } label: {
                                Image(systemName: symbol)
                                    .foregroundStyle(PlanIconColor.resolved(draft.colorID).color)
                                    .frame(width: 40, height: 40)
                                    .background(draft.iconSymbol == symbol ? PlanningPalette.accent.opacity(0.16) : Color(uiColor: .secondarySystemBackground), in: Circle())
                                    .overlay(Circle().stroke(draft.iconSymbol == symbol ? PlanningPalette.accent : Color.clear, lineWidth: 1.5))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                HStack(spacing: 11) {
                    ForEach(PlanIconColor.allCases) { choice in
                        Button { draft.colorID = choice.rawValue } label: {
                            Circle().fill(choice.color).frame(width: 32, height: 32)
                                .overlay(Circle().stroke(draft.colorID == choice.rawValue ? PlanningPalette.accent : Color.clear, lineWidth: 2).padding(-3))
                        }
                        .buttonStyle(.plain)
                    }
                }
                if !isNew {
                    Button {
                        PlanningDiscardConfirmation.presentDestructive(message: PlanningText.string(.postponeDeleteConfirm), destructiveTitle: PlanningText.string(.postponeDelete)) {
                            onDelete(draft.id)
                        }
                    } label: {
                        Label("削除", systemImage: "trash").frame(maxWidth: .infinity).frame(height: 52)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct TodayPastTasksSheet: View {
    @ObservedObject var session: PlanningSession
    @State private var collapsed: Set<String> = []
    @State private var copying: PlanningNode?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        PlanningSystemSheetChrome(
            onClose: { dismiss() },
            onConfirm: {},
            centerTitle: "過去のタスクを追加",
            maximumBody: PlanningTokens.Sheet.maximumBody,
            bodySurface: .white,
            showsConfirm: false,
            subtitle: "過去2週間のタスクから追加できます"
        ) {
            let groups = session.pastTaskGroups()
            VStack(alignment: .leading, spacing: 11) {
                if groups.isEmpty {
                    Text("該当するタスクはありません").foregroundStyle(PlanningPalette.muted)
                }
                ForEach(groups, id: \.key) { group in
                    let expanded = !collapsed.contains(group.key)
                    VStack(alignment: .leading, spacing: 4) {
                        Button {
                            if expanded { collapsed.insert(group.key) } else { collapsed.remove(group.key) }
                        } label: {
                            HStack {
                                Text(TodayHistoryLabel.heading(key: group.key, todayKey: session.todayStamp))
                                    .font(.system(size: 15, weight: .semibold))
                                    .foregroundStyle(PlanningPalette.ink)
                                Spacer(minLength: 8)
                                Image(systemName: expanded ? "chevron.up" : "chevron.down")
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundStyle(PlanningPalette.muted)
                            }
                            .frame(minHeight: 40)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        if expanded {
                            ForEach(group.nodes) { node in
                                HStack(spacing: 8) {
                                    Circle()
                                        .fill(PlanIconColor.resolved(node.colorID).color)
                                        .frame(width: 13, height: 13)
                                    Text(node.title)
                                        .font(.system(size: 15.5))
                                        .foregroundStyle(PlanningPalette.ink)
                                        .lineLimit(2)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                    historyBadge(completed: node.completed)
                                    Button { copying = node } label: {
                                        Image(systemName: "plus")
                                            .font(.system(size: 15, weight: .bold))
                                            .foregroundStyle(.white)
                                            .frame(width: 32, height: 32)
                                            .background(PlanningPalette.accent, in: Circle())
                                    }
                                    .buttonStyle(.plain)
                                }
                                .frame(minHeight: 50)
                            }
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.white, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(PlanningPalette.line, lineWidth: 0.7))
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .sheet(item: $copying) { node in
            PlanningItemEditorSheet(draft: session.todayImportDraft(from: node), isNew: true, bucket: .daily, kind: .task, periodKey: session.todayStamp) { draft in
                session.saveItem(existingID: nil, draft: draft, bucket: .daily, kind: .task, periodKey: session.todayStamp)
                copying = nil
            } onClose: { copying = nil }
        }
    }

    private func historyBadge(completed: Bool) -> some View {
        HStack(spacing: 4) {
            Image(systemName: completed ? "checkmark" : "circle")
                .font(.system(size: 11, weight: .bold))
            Text(completed ? "完了" : "未完了")
                .font(.system(size: 12, weight: .semibold))
        }
        .foregroundStyle(completed ? Color(red: 0.28, green: 0.55, blue: 0.38) : PlanningPalette.muted)
        .padding(.horizontal, 8)
        .frame(minWidth: 68)
        .frame(height: 28)
        .background(completed ? Color(red: 0.86, green: 0.93, blue: 0.87) : Color(red: 0.93, green: 0.91, blue: 0.88), in: Capsule())
    }
}

private struct TodayAddControl: View {
    @Binding var showingMenu: Bool
    let onTask: () -> Void
    let onMemo: () -> Void

    var body: some View {
        if #available(iOS 26.0, *) {
            TodayGlassAddControl(showingMenu: $showingMenu, onTask: onTask, onMemo: onMemo)
        } else {
            TodayFallbackAddControl(showingMenu: $showingMenu, onTask: onTask, onMemo: onMemo)
        }
    }
}

@available(iOS 26.0, *)
private struct TodayGlassAddControl: View {
    @Binding var showingMenu: Bool
    let onTask: () -> Void
    let onMemo: () -> Void
    @Namespace private var morph
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        GlassEffectContainer {
            if showingMenu {
                TodayAddMenuRows(onTask: onTask, onMemo: onMemo)
                    .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                    .glassEffectID("today-add", in: morph)
                    .glassEffectTransition(.matchedGeometry)
            } else {
                plusButton
                    .glassEffect(.regular.tint(PlanningPalette.accent).interactive(), in: Circle())
                    .glassEffectID("today-add", in: morph)
                    .glassEffectTransition(.matchedGeometry)
            }
        }
        .animation(reduceMotion ? nil : .spring(response: 0.35, dampingFraction: 0.86), value: showingMenu)
    }

    private var plusButton: some View {
        Button { showingMenu = true } label: {
            Image(systemName: "plus")
                .font(.system(size: 24, weight: .semibold))
                .foregroundStyle(Color.white)
                .frame(width: 52, height: 52)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("追加")
    }
}

private struct TodayFallbackAddControl: View {
    @Binding var showingMenu: Bool
    let onTask: () -> Void
    let onMemo: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            if showingMenu {
                TodayAddMenuRows(onTask: onTask, onMemo: onMemo)
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                    .transition(.scale(scale: 0.22, anchor: .bottomTrailing).combined(with: .opacity))
            } else {
                Button { showingMenu = true } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 24, weight: .semibold))
                        .foregroundStyle(Color.white)
                        .frame(width: 52, height: 52)
                        .background(Circle().fill(PlanningPalette.accent))
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("追加")
            }
        }
        .animation(reduceMotion ? nil : .spring(response: 0.28, dampingFraction: 0.86), value: showingMenu)
    }
}

private struct TodayAddMenuRows: View {
    let onTask: () -> Void
    let onMemo: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            row("今日のタスクを追加", symbol: "checkmark", action: onTask)
            row("クイックメモを追加", symbol: "pencil", action: onMemo)
        }
        .frame(width: 250)
    }

    private func row(_ title: String, symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: symbol).frame(width: 22)
                Text(title).frame(maxWidth: .infinity, alignment: .leading)
            }
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(PlanningPalette.ink)
            .padding(.horizontal, 18)
            .frame(minHeight: 48)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
