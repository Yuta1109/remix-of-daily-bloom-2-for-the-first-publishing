import SwiftUI
import Charts

struct TodayRootView: View {
    @EnvironmentObject private var session: PlanningSession
    @EnvironmentObject private var navigation: TabNavigationState
    @Environment(\.scenePhase) private var scenePhase
    @State private var plusOffset: CGSize = .zero
    @State private var showingMenu = false
    @State private var creatingTask = false
    @State private var creatingMemo = false
    @State private var editingTask: UUID?
    @State private var editingMemo: QuickMemo?
    @State private var showingPast = false
    @State private var plusFrame: CGRect = .zero

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                routineCard
                taskCard
                memoCard
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 88)
        }
        .planningScroll()
        .planningFixedHeader {
            todayHeader
        }
        .overlay { plusLayer }
        .onAppear { session.refreshTodayStamp() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { session.refreshTodayStamp() }
        }
        .onDisappear {
            plusOffset = .zero
            showingMenu = false
        }
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
        HStack(alignment: .center, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text("今日")
                    .font(.system(size: 34, weight: .bold))
                    .foregroundStyle(PlanningPalette.ink)
                Text(PeriodCalendar.label(bucket: .daily, key: session.todayStamp))
                    .font(.system(size: 15))
                    .foregroundStyle(PlanningPalette.muted)
            }
            Spacer(minLength: 0)
            NativeGlassIconButton(icon: .clock, accessibilityLabel: "過去のタスク") { showingPast = true }
            NativeGlassIconButton(icon: .user, accessibilityLabel: "User") {}
        }
        .padding(.horizontal, 16)
    }

    private var routineCard: some View {
        TodaySectionCard(title: "ルーティン", symbol: "sun.max.fill", tint: PlanningPalette.accent, expanded: $session.todayRoutineExpanded, trailing: {
            Button("一覧を見る") {
                PlanningTransition.perform { navigation.path.append(TodayRoute.routineList) }
            }
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(PlanningPalette.accent)
            .buttonStyle(.plain)
        }) {
            ForEach(session.visibleRoutines()) { routine in
                HStack(spacing: 12) {
                    Button {
                        session.toggleRoutine(routine, dayKey: session.todayStamp)
                    } label: {
                        PeriodListCheckbox(square: true, completed: session.routineCompleted(routine, dayKey: session.todayStamp))
                            .frame(width: 20, height: 20)
                    }
                    .buttonStyle(.plain)
                    Button {
                        navigation.path.append(TodayRoute.routineDetail(routine.id))
                    } label: {
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(routine.title).font(.system(size: 16, weight: .semibold)).foregroundStyle(PlanningPalette.ink)
                                Text(TodayFormatting.weekdays(routine)).font(.system(size: 12)).foregroundStyle(PlanningPalette.muted)
                                Text(TodayFormatting.time(routine)).font(.system(size: 12)).foregroundStyle(PlanningPalette.muted)
                            }
                            Spacer(minLength: 0)
                            TodayIconBadge(symbol: routine.iconSymbol, tint: PlanningPalette.accent)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var taskCard: some View {
        TodaySectionCard(title: "今日のタスク", symbol: "checkmark.circle.fill", tint: Color(red: 0.45, green: 0.72, blue: 0.55), expanded: $session.todayTasksExpanded, trailing: { EmptyView() }) {
            ForEach(session.todayTasks()) { node in
                VStack(alignment: .leading, spacing: 8) {
                    taskRow(node, indent: false)
                    ForEach(node.children) { child in
                        HStack(spacing: 8) {
                            Rectangle().fill(PlanningPalette.line).frame(width: 1.5, height: 28)
                            taskRow(child, indent: true)
                        }
                        .padding(.leading, 8)
                    }
                }
            }
        }
    }

    private func taskRow(_ node: PlanningNode, indent: Bool) -> some View {
        HStack(spacing: 10) {
            Button {
                _ = session.setCompleted(nodeID: node.id, completed: !node.completed)
            } label: {
                PeriodListCheckbox(square: true, completed: node.completed).frame(width: 20, height: 20)
            }
            .buttonStyle(.plain)
            Button { editingTask = node.id } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(node.title).font(.system(size: 16)).foregroundStyle(PlanningPalette.ink)
                        if node.startMinutes != nil || node.startDay != nil {
                            Text(PlanningRangeText.display(startDay: node.startDay, endDay: node.endDay, startMinutes: node.startMinutes, endMinutes: node.endMinutes))
                                .font(.system(size: 12)).foregroundStyle(PlanningPalette.muted)
                        }
                    }
                    Spacer(minLength: 0)
                    if !indent { TodayIconBadge(symbol: node.iconSymbol, tint: PlanningPalette.accent) }
                }
            }
            .buttonStyle(.plain)
        }
    }

    private var memoCard: some View {
        TodaySectionCard(title: "クイックメモ", symbol: "pencil", tint: Color(red: 0.45, green: 0.62, blue: 0.38), expanded: $session.todayMemosExpanded, trailing: { EmptyView() }) {
            ForEach(session.quickMemos) { memo in
                Button { editingMemo = memo } label: {
                    HStack(spacing: 10) {
                        TodayIconBadge(symbol: memo.iconSymbol, tint: Color(red: 0.55, green: 0.45, blue: 0.75))
                        Text(memo.text).font(.system(size: 15)).foregroundStyle(PlanningPalette.ink).lineLimit(2)
                        Spacer(minLength: 8)
                        Text(TodayFormatting.clock(memo.minutes)).font(.system(size: 12)).foregroundStyle(PlanningPalette.muted)
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var plusLayer: some View {
        GeometryReader { geo in
            ZStack(alignment: .topLeading) {
                if showingMenu {
                    Color.black.opacity(0.001)
                        .onTapGesture { showingMenu = false }
                    todayMenu
                        .offset(x: menuOrigin(in: geo).x, y: menuOrigin(in: geo).y)
                        .transition(.scale(scale: 0.22, anchor: .bottomTrailing).combined(with: .opacity))
                }
                NativeGlassIconButton(icon: .plus, accessibilityLabel: "追加", prominent: false) {
                    plusOffset = .zero
                    showingMenu = true
                }
                .background {
                    GeometryReader { button in
                        Color.clear.preference(key: TodayPlusFrameKey.self, value: button.frame(in: .named("todayOverlay")))
                    }
                }
                .position(homePlus(in: geo))
                .offset(plusOffset)
                .gesture(DragGesture(minimumDistance: 14).onEnded { value in
                    plusOffset = clamped(plusOffset + CGSize(width: value.translation.width, height: value.translation.height), in: geo)
                })
            }
            .coordinateSpace(name: "todayOverlay")
            .onPreferenceChange(TodayPlusFrameKey.self) { plusFrame = $0 }
            .animation(.spring(response: 0.28, dampingFraction: 0.86), value: showingMenu)
        }
        .allowsHitTesting(true)
    }

    private var todayMenu: some View {
        let shape = RoundedRectangle(cornerRadius: 22, style: .continuous)
        return VStack(spacing: 0) {
            menuRow("今日のタスクを追加", symbol: "checkmark") {
                showingMenu = false
                plusOffset = .zero
                creatingTask = true
            }
            menuRow("クイックメモを追加", symbol: "pencil") {
                showingMenu = false
                plusOffset = .zero
                creatingMemo = true
            }
        }
        .frame(width: 240)
        .background {
            if #available(iOS 26.0, *) {
                shape.fill(.clear).glassEffect(.regular, in: shape)
            } else {
                shape.fill(.ultraThinMaterial)
            }
        }
        .clipShape(shape)
    }

    private func menuRow(_ title: String, symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 10) {
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

    private func homePlus(in geo: GeometryProxy) -> CGPoint {
        CGPoint(x: geo.size.width - 46, y: geo.size.height - 46)
    }

    private func menuOrigin(in geo: GeometryProxy) -> CGPoint {
        let width: CGFloat = 240
        let height: CGFloat = 96
        let anchor = plusFrame.width > 1 ? plusFrame : CGRect(origin: homePlus(in: geo), size: CGSize(width: 44, height: 44))
        var x = anchor.maxX - width
        var y = anchor.minY - height + 12
        x = min(max(8, x), geo.size.width - width - 8)
        y = min(max(8, y), geo.size.height - height - 8)
        return CGPoint(x: x, y: y)
    }

    private func clamped(_ offset: CGSize, in geo: GeometryProxy) -> CGSize {
        let home = homePlus(in: geo)
        let x = min(max(28 - home.x, offset.width), geo.size.width - 28 - home.x)
        let y = min(max(72 - home.y, offset.height), geo.size.height - 28 - home.y)
        return CGSize(width: x, height: y)
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

private struct TodayPlusFrameKey: PreferenceKey {
    static var defaultValue: CGRect = .zero
    static func reduce(value: inout CGRect, nextValue: () -> CGRect) {
        let next = nextValue()
        if next.width > 1 { value = next }
    }
}

struct TodaySectionCard<Trailing: View, Content: View>: View {
    let title: String
    let symbol: String
    let tint: Color
    @Binding var expanded: Bool
    @ViewBuilder var trailing: () -> Trailing
    @ViewBuilder var content: () -> Content

    init(title: String, symbol: String, tint: Color, expanded: Binding<Bool>, @ViewBuilder trailing: @escaping () -> Trailing = { EmptyView() }, @ViewBuilder content: @escaping () -> Content) {
        self.title = title
        self.symbol = symbol
        self.tint = tint
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
                        Image(systemName: symbol).foregroundStyle(tint)
                        Text(title).font(.system(size: 20, weight: .bold)).foregroundStyle(PlanningPalette.ink)
                        Spacer(minLength: 0)
                    }
                }
                .buttonStyle(.plain)
                trailing()
            }
            if expanded { content() }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(red: 1, green: 0.992, blue: 0.973), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Color(red: 0.90, green: 0.86, blue: 0.80), lineWidth: 0.8))
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
}

struct TodayRoutineListPage: View {
    @ObservedObject var session: PlanningSession
    @EnvironmentObject private var navigation: TabNavigationState
    @State private var creating = false
    @State private var plusOffset: CGSize = .zero

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                ForEach(session.routines) { routine in
                    Button {
                        navigation.path.append(TodayRoute.routineDetail(routine.id))
                    } label: {
                        HStack(spacing: 12) {
                            TodayIconBadge(symbol: routine.iconSymbol, tint: PlanningPalette.accent)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(routine.title).font(.system(size: 16, weight: .bold)).foregroundStyle(PlanningPalette.ink).lineLimit(2)
                                Text(TodayFormatting.weekdays(routine)).font(.system(size: 13)).foregroundStyle(PlanningPalette.muted)
                                Text(TodayFormatting.time(routine)).font(.system(size: 13)).foregroundStyle(PlanningPalette.muted)
                            }
                            Spacer(minLength: 8)
                            TodayRateRing(rate: session.routineMonthRate(routine))
                            Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(PlanningPalette.muted)
                        }
                        .padding(14)
                        .frame(minHeight: 96)
                        .background(Color.white, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(16)
            .padding(.bottom, 80)
        }
        .planningPageChrome(title: "ルーティン一覧", onBack: { navigation.pop() })
        .overlay {
            GeometryReader { geo in
                NativeGlassIconButton(icon: .plus, accessibilityLabel: "ルーティンを追加") {
                    plusOffset = .zero
                    creating = true
                }
                .position(x: geo.size.width - 46, y: geo.size.height - 46)
                .offset(plusOffset)
                .gesture(DragGesture(minimumDistance: 14).onEnded { value in
                    plusOffset.width += value.translation.width
                    plusOffset.height += value.translation.height
                })
            }
        }
        .onDisappear { plusOffset = .zero }
        .sheet(isPresented: $creating) {
            TodayRoutineSheet(routine: nil) { routine in
                session.saveRoutine(routine, isNew: true)
                creating = false
            } onDelete: { _ in } onClose: { creating = false }
        }
    }
}

struct TodayRateRing: View {
    let rate: Int
    var body: some View {
        ZStack {
            Circle().stroke(PlanningPalette.line, lineWidth: 6)
            Circle().trim(from: 0, to: CGFloat(rate) / 100)
                .stroke(Color(red: 0.35, green: 0.70, blue: 0.55), style: StrokeStyle(lineWidth: 6, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Text("\(rate)%").font(.system(size: 12, weight: .bold))
        }
        .frame(width: 54, height: 54)
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
                    HStack(spacing: 12) {
                        TodayIconBadge(symbol: routine.iconSymbol, tint: PlanningPalette.accent)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(routine.title).font(.system(size: 18, weight: .bold))
                            Text("\(TodayFormatting.weekdays(routine)) · \(TodayFormatting.time(routine))")
                                .font(.system(size: 13)).foregroundStyle(PlanningPalette.muted)
                        }
                        Spacer()
                        Button("編集") { editing = true }
                            .font(.system(size: 15, weight: .semibold))
                    }
                    .padding(16)
                    .background(Color.white, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                    monthCard(routine)
                    monthChart(routine)
                    weekCard(routine)
                }
                .padding(16)
            }
        }
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

    private func monthCard(_ routine: RoutineDefinition) -> some View {
        let rate = session.routineMonthRate(routine)
        let elapsed = TodayAchievement.elapsedDayCount(monthContaining: Date())
        let achieved = session.achievedDayCount(routine)
        return VStack(alignment: .leading, spacing: 8) {
            Text("今月の達成率").font(.system(size: 16, weight: .semibold))
            Text("\(rate)%").font(.system(size: 40, weight: .bold))
            ProgressView(value: Double(rate), total: 100).tint(Color(red: 0.35, green: 0.70, blue: 0.55))
            Text("\(achieved) / \(elapsed) 日").font(.system(size: 13)).foregroundStyle(PlanningPalette.muted)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func monthChart(_ routine: RoutineDefinition) -> some View {
        let keys = TodayAchievement.monthKeys(endingAt: Date(), count: 6)
        let rows = keys.map { key -> (String, Int) in
            let achieved = session.routineCompletions.filter { $0.routineID == routine.id && $0.dayKey.hasPrefix(key) }.count
            let parts = key.split(separator: "-").compactMap { Int($0) }
            let elapsed = key == PeriodCalendar.currentKey(.monthly)
                ? TodayAchievement.elapsedDayCount(monthContaining: Date())
                : PeriodCalendar.daysInMonth(year: parts.first ?? 2026, month: parts.count > 1 ? parts[1] : 1)
            return (String(key.suffix(2)), TodayAchievement.rate(achieved: achieved, elapsed: elapsed))
        }
        return VStack(alignment: .leading, spacing: 8) {
            Text("月ごとの達成率の変化").font(.system(size: 16, weight: .semibold))
            Chart(Array(rows.enumerated()), id: \.offset) { item in
                BarMark(x: .value("月", item.element.0), y: .value("率", item.element.1))
                    .foregroundStyle(item.offset == rows.count - 1 ? Color.blue : Color.blue.opacity(0.35))
            }
            .frame(height: 160)
        }
        .padding(16)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func weekCard(_ routine: RoutineDefinition) -> some View {
        let achieved = Set(session.routineCompletions.filter { $0.routineID == routine.id }.map(\.dayKey))
        let weeks = TodayAchievement.weeks(monthContaining: Date(), achieved: achieved)
        return VStack(alignment: .leading, spacing: 8) {
            Text("今月の週ごとの達成状況").font(.system(size: 16, weight: .semibold))
            HStack(alignment: .bottom, spacing: 8) {
                ForEach(weeks, id: \.index) { week in
                    let rate = TodayAchievement.rate(achieved: week.achievedDays, elapsed: week.elapsedDays)
                    VStack(spacing: 4) {
                        Text("\(rate)%").font(.system(size: 11, weight: .bold))
                        RoundedRectangle(cornerRadius: 6).fill(Color.blue.opacity(0.7))
                            .frame(height: max(8, CGFloat(rate) * 0.8))
                        Text("\(week.index)週目").font(.system(size: 11))
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .frame(height: 120, alignment: .bottom)
        }
        .padding(16)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

struct TodayRoutineSheet: View {
    @State var draft: RoutineDefinition
    let isNew: Bool
    let onSave: (RoutineDefinition) -> Void
    let onDelete: (UUID) -> Void
    let onClose: () -> Void

    init(routine: RoutineDefinition?, onSave: @escaping (RoutineDefinition) -> Void, onDelete: @escaping (UUID) -> Void, onClose: @escaping () -> Void) {
        let initial = routine ?? RoutineDefinition(title: "", iconSymbol: "sun.max", everyDay: true, weekdays: [], timeMode: .anytime, startMinutes: nil, endMinutes: nil, isPaused: false, createdAt: Date(), updatedAt: Date())
        _draft = State(initialValue: initial)
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

    var body: some View {
        PlanningSystemSheetChrome(onClose: onClose, onConfirm: { if canSave { onSave(draft) } }, confirmEnabled: canSave, centerTitle: isNew ? "ルーティンを追加" : "ルーティンを編集", maximumBody: PlanningTokens.Sheet.maximumBody, bodySurface: .white) {
            VStack(alignment: .leading, spacing: 16) {
                TextField("タイトル", text: $draft.title)
                    .padding(.horizontal, 12).frame(height: 46)
                    .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        ForEach(PlanningIconCatalog.symbols, id: \.self) { symbol in
                            Button { draft.iconSymbol = symbol } label: {
                                Image(systemName: symbol).frame(width: 36, height: 36)
                                    .overlay(Circle().stroke(draft.iconSymbol == symbol ? PlanningPalette.accent : Color.clear, lineWidth: 2))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                weekdayRow
                timeRow
                Toggle(isOn: $draft.isPaused) {
                    VStack(alignment: .leading) {
                        Text("このルーティンを一旦停止する")
                        Text("一時停止中は今日の一覧に表示されません").font(.system(size: 12)).foregroundStyle(PlanningPalette.muted)
                    }
                }
                if !isNew {
                    Button {
                        PlanningDiscardConfirmation.presentDestructive(message: PlanningText.string(.postponeDeleteConfirm), destructiveTitle: PlanningText.string(.postponeDelete)) {
                            onDelete(draft.id)
                        }
                    } label: {
                        Label("削除", systemImage: "trash")
                            .frame(maxWidth: .infinity).frame(height: 52)
                            .foregroundStyle(Color(red: 0.75, green: 0.22, blue: 0.18))
                            .background(Color(red: 0.75, green: 0.22, blue: 0.18).opacity(0.12), in: RoundedRectangle(cornerRadius: 14))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var weekdayRow: some View {
        let labels = [(0, "毎日"), (2, "月"), (3, "火"), (4, "水"), (5, "木"), (6, "金"), (7, "土"), (1, "日")]
        return HStack {
            ForEach(labels, id: \.0) { item in
                let selected = item.0 == 0 ? draft.everyDay : draft.weekdays.contains(item.0)
                Button {
                    let choice: TodayWeekChoice = item.0 == 0 ? .everyDay : .weekday(item.0)
                    let next = TodayAchievement.applyWeekday(everyDay: draft.everyDay, days: draft.weekdays, choice: choice)
                    draft.everyDay = next.everyDay
                    draft.weekdays = next.days
                } label: {
                    Text(item.1)
                        .font(.system(size: 13, weight: .semibold))
                        .padding(.horizontal, 8).padding(.vertical, 8)
                        .background(selected ? PlanningPalette.accent : Color(uiColor: .secondarySystemBackground), in: Capsule())
                        .foregroundStyle(selected ? Color.white : PlanningPalette.ink)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var timeRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            Picker("時間", selection: $draft.timeMode) {
                Text("随時").tag(RoutineTimeMode.anytime)
                Text("時刻").tag(RoutineTimeMode.clock)
                Text("時間帯").tag(RoutineTimeMode.range)
            }
            .pickerStyle(.segmented)
            if draft.timeMode != .anytime {
                Stepper(TodayFormatting.clock(draft.startMinutes ?? 420), value: Binding(get: { draft.startMinutes ?? 420 }, set: { draft.startMinutes = $0 }), in: 0...1439, step: 15)
            }
            if draft.timeMode == .range {
                Stepper(TodayFormatting.clock(draft.endMinutes ?? 480), value: Binding(get: { draft.endMinutes ?? 480 }, set: { draft.endMinutes = $0 }), in: 0...1439, step: 15)
            }
        }
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
            VStack(alignment: .leading, spacing: 14) {
                TextField("メモ", text: $draft.text, axis: .vertical).lineLimit(3...8)
                    .padding(12)
                    .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
                Stepper(TodayFormatting.clock(draft.minutes), value: $draft.minutes, in: 0...1439, step: 5)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        ForEach(PlanningIconCatalog.symbols, id: \.self) { symbol in
                            Button { draft.iconSymbol = symbol } label: {
                                Image(systemName: symbol).frame(width: 36, height: 36)
                                    .overlay(Circle().stroke(draft.iconSymbol == symbol ? PlanningPalette.accent : Color.clear, lineWidth: 2))
                            }
                            .buttonStyle(.plain)
                        }
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
        }
    }
}

struct TodayPastTasksSheet: View {
    @ObservedObject var session: PlanningSession
    @State private var collapsed: Set<String> = []
    @State private var copying: PlanningNode?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        PlanningSystemSheetChrome(onClose: { dismiss() }, onConfirm: { dismiss() }, centerTitle: "過去のタスクを追加", maximumBody: PlanningTokens.Sheet.maximumBody, bodySurface: .white) {
            VStack(alignment: .leading, spacing: 12) {
                Text("過去2週間のタスクから追加できます").font(.system(size: 13)).foregroundStyle(PlanningPalette.muted)
                let groups = session.pastTaskGroups()
                if groups.isEmpty {
                    Text("該当するタスクはありません").foregroundStyle(PlanningPalette.muted)
                }
                ForEach(groups, id: \.key) { group in
                    VStack(alignment: .leading, spacing: 8) {
                        Button {
                            if collapsed.contains(group.key) { collapsed.remove(group.key) } else { collapsed.insert(group.key) }
                        } label: {
                            Text(PeriodCalendar.label(bucket: .daily, key: group.key)).font(.system(size: 16, weight: .bold))
                        }
                        .buttonStyle(.plain)
                        if !collapsed.contains(group.key) {
                            ForEach(group.nodes) { node in
                                HStack {
                                    Text(node.title).lineLimit(1)
                                    Spacer()
                                    Text(node.completed ? "完了" : "未完了").font(.system(size: 12))
                                    Button { copying = node } label: {
                                        Image(systemName: "plus").frame(width: 28, height: 28)
                                            .background(PlanningPalette.accent, in: Circle()).foregroundStyle(.white)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                }
            }
        }
        .sheet(item: $copying) { node in
            PlanningItemEditorSheet(draft: PlanningItemDraft(node: node), isNew: true, bucket: .daily, kind: .task, periodKey: session.todayStamp) { draft in
                session.copyTaskToToday(node)
                if let created = session.todayTasks().last {
                    session.saveItem(existingID: created.id, draft: draft, bucket: .daily, kind: .task, periodKey: session.todayStamp)
                }
                copying = nil
            } onClose: { copying = nil }
        }
    }
}
