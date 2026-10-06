import SwiftUI

struct PeriodPlannerPage: View {
    @ObservedObject var session: PlanningSession
    @EnvironmentObject private var navigation: TabNavigationState
    let bucket: PlanningBucket

    @State private var showingPicker = false
    @State private var addingKind: PlanningItemKind?
    @State private var tabBarHeight: CGFloat = 0
    @State private var editingGoal = false
    @State private var tasksExpanded = true
    @State private var eventsExpanded = true

    private var periodKey: String { session.periodKey(for: bucket) }

    var body: some View {
        PlanningHorizontalPager(pages: pageKeys, selection: periodSelection) { key in
            periodPage(key)
        }
        .background(PlanningTabBarHeightReader(height: $tabBarHeight))
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if session.isActivePrompt(ReflectionScope.period(bucket, periodKey)),
               !periodHasSavedMemory(periodKey) {
                PlanningReflectionDueCard(bucket: bucket, action: {
                    let scope = ReflectionScope.period(bucket, periodKey)
                    session.refreshDue(scope)
                    PlanningTransition.perform { navigation.path.append(PlanningRoute.reflection(scope)) }
                }, tabBarHeight: tabBarHeight)
                .padding(.leading, PlanningTokens.contentInset)
                .padding(.trailing, PlanningTokens.contentInset)
                .padding(.bottom, 8)
            }
        }
        .onAppear {
            session.refreshDue(ReflectionScope.period(bucket, periodKey))
        }
        .sheet(isPresented: $editingGoal) {
            monthlyGoalEditor
        }
        .sheet(isPresented: $showingPicker) {
            PeriodPickerSheet(session: session, bucket: bucket) { showingPicker = false }
        }
        .sheet(
            isPresented: Binding(
                get: { addingKind != nil },
                set: { if !$0 { addingKind = nil } }
            )
        ) {
            if let addingKind {
                PeriodItemListSheet(session: session, bucket: bucket, kind: addingKind, periodKey: periodKey)
            }
        }
    }

    private var pageKeys: [String] {
        let anchor = PeriodCalendar.currentKey(bucket)
        let span = bucket == .daily ? -45...45 : -24...24
        return span.map { PeriodCalendar.shift(anchor, bucket: bucket, by: $0) }
    }

    private var periodSelection: Binding<String> {
        Binding(
            get: { session.periodKey(for: bucket) },
            set: { session.assignPeriod($0, bucket: bucket) }
        )
    }

    private func periodPage(_ key: String) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                PlanningSectionIntro(
                    title: introTitle,
                    message: PlanningText.string(introKey),
                    topGap: PlanningTokens.PeriodIntro.topGap
                ) {
                    Image(systemName: introSymbol)
                        .font(.system(size: 20, weight: .semibold))
                        .frame(width: PlanningTokens.PlanMain.iconSlot, height: PlanningTokens.PlanMain.iconSlot)
                        .foregroundStyle(PlanningPalette.accent)
                }
                periodBar(key)
                if bucket == .monthly {
                    monthlyGoal(key)
                }
                periodBody(key)
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 16)
            .padding(.bottom, session.isActivePrompt(ReflectionScope.period(bucket, key)) ? PlanningTokens.ReflectionDue.height(tabBar: tabBarHeight) + 24 : 0)
        }
        .planningScroll()
        .planningInitialScrollMargin()
        .planningKeyboardDismiss()
    }

    private var introTitle: String {
        switch bucket {
        case .monthly: "Monthly"
        case .weekly: "Weekly"
        case .daily: "Daily"
        }
    }

    private var introKey: PlanningText.Key {
        switch bucket {
        case .monthly: .monthlyDescription
        case .weekly: .weeklyDescription
        case .daily: .dailyDescription
        }
    }

    private var introSymbol: String {
        switch bucket {
        case .monthly: "calendar"
        case .weekly: "calendar.badge.clock"
        case .daily: "sun.max"
        }
    }

    private func periodBar(_ key: String) -> some View {
        ZStack {
            Button {
                PlanningTransition.perform { showingPicker = true }
            } label: {
                Text(PeriodCalendar.label(bucket: bucket, key: key))
                    .foregroundStyle(PlanningPalette.ink)
                    .font(.system(size: 17, weight: .semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(PlanningTokens.PeriodSelector.labelScaleFloor)
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: PlanningTokens.PeriodSelector.arrowZone)
            }
            .buttonStyle(.plain)
            .padding(.horizontal, PlanningTokens.PeriodSelector.arrowZone)
            HStack {
                Button {
                    session.shiftPeriod(bucket, by: -1)
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(PlanningPalette.accent)
                        .frame(width: PlanningTokens.PeriodSelector.arrowZone, height: PlanningTokens.PeriodSelector.arrowZone)
                }
                Spacer(minLength: 0)
                Button {
                    session.shiftPeriod(bucket, by: 1)
                } label: {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(PlanningPalette.accent)
                        .frame(width: PlanningTokens.PeriodSelector.arrowZone, height: PlanningTokens.PeriodSelector.arrowZone)
                }
            }
        }
        .buttonStyle(.plain)
    }

    private func periodHasSavedMemory(_ key: String) -> Bool {
        let scope = ReflectionScope.period(bucket, key)
        return session.memoryEntries.contains { $0.scope == scope && $0.saved }
    }

    @ViewBuilder
    private func periodBody(_ key: String) -> some View {
        let scope = ReflectionScope.period(bucket, key)
        if let entry = session.memoryEntries.first(where: { $0.scope == scope && $0.saved }) {
            SavedPeriodMemory(session: session, entry: entry, scope: scope)
        } else {
            let reflected = session.isReflectionComplete(bucket: bucket, periodKey: key)
            let elapsed = PeriodCalendar.periodHasEnded(bucket, key: key)
            let inactive = !session.existingRecord(bucket: bucket, periodKey: key).hasMeaningfulActivity
            if !reflected, elapsed, inactive {
                NoActivityMemorySection(session: session, scope: scope)
            } else {
                if reflected {
                    ReflectionResultView(session: session, scope: scope)
                }
                periodListSection(.task, key: key, expanded: $tasksExpanded)
                periodListSection(.event, key: key, expanded: $eventsExpanded)
            }
        }
    }

    private func monthlyGoal(_ key: String) -> some View {
        let parts = PeriodCalendar.monthParts(key)
        let goal = session.goal(year: parts.year, month: parts.month)
        return HStack(alignment: .center, spacing: 12) {
            Image(systemName: "flag.fill")
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(PlanningPalette.accent)
                .frame(width: PlanningTokens.PeriodBody.goalIcon, height: PlanningTokens.PeriodBody.goalIcon)
            VStack(alignment: .leading, spacing: 4) {
                Text("今月の目標")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(PlanningPalette.accent)
                Text(goal.isEmpty ? "目標は1つ" : goal)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(goal.isEmpty ? PlanningPalette.muted : PlanningPalette.ink)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(12)
        .background(PlanningPalette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(PlanningPalette.line, lineWidth: 1))
        .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .onTapGesture { PlanningTransition.perform { editingGoal = true } }
    }

    private var monthlyGoalEditor: some View {
        let parts = PeriodCalendar.monthParts(periodKey)
        return PlanningSystemSheetChrome(
            onClose: { editingGoal = false },
            onConfirm: { editingGoal = false },
            centerTitle: "今月の目標",
            bodySurface: Color.white
        ) {
            TextField(
                "目標は1つ",
                text: Binding(
                    get: { session.goal(year: parts.year, month: parts.month) },
                    set: { session.setGoal($0, year: parts.year, month: parts.month) }
                )
            )
            .padding(16)
        }
    }

    private func periodListSection(_ kind: PlanningItemKind, key: String, expanded: Binding<Bool>) -> some View {
        let nodes = session.nodes(bucket: bucket, periodKey: key, kind: kind)
        return VStack(alignment: .leading, spacing: 8) {
            Button {
                expanded.wrappedValue.toggle()
            } label: {
                HStack {
                    Text(kind == .task ? "ToDo" : "予定")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(PlanningPalette.ink)
                    Spacer(minLength: 0)
                    Image(systemName: expanded.wrappedValue ? "chevron.down" : "chevron.right")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(PlanningPalette.muted)
                        .frame(width: 44, height: 28)
                }
            }
            .buttonStyle(.plain)
            if expanded.wrappedValue {
                if kind == .task {
                    PeriodParentTimeline(nodes: nodes) { addingKind = kind }
                } else {
                    VStack(spacing: 0) {
                        ForEach(nodes) { node in
                            PeriodEventRow(node: node) { addingKind = kind }
                        }
                    }
                }
            }
        }
        .padding(PlanningTokens.PeriodBody.cardPadding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white, in: RoundedRectangle(cornerRadius: PlanningTokens.PeriodBody.cardRadius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: PlanningTokens.PeriodBody.cardRadius, style: .continuous).stroke(PlanningPalette.line, lineWidth: 1))
    }
}

/// Parent checkboxes share one X. The line joins those positions and does not touch them.
private struct PeriodParentTimeline: View {
    let nodes: [PlanningNode]
    let open: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(nodes.enumerated()), id: \.element.id) { index, node in
                parentBlock(node, connectsToNext: index < nodes.count - 1)
            }
        }
    }

    private func parentBlock(_ node: PlanningNode, connectsToNext: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            PeriodOverviewRow(node: node, square: true, showsIcon: true, action: open)
            if connectsToNext || !node.children.isEmpty {
                HStack(alignment: .top, spacing: 8) {
                    VStack(spacing: 0) {
                        Color.clear.frame(height: PlanningTokens.PeriodBody.timelineGap)
                        if connectsToNext {
                            Rectangle()
                                .fill(PlanningPalette.line)
                                .frame(width: PlanningTokens.PeriodBody.timelineWidth)
                                .frame(minHeight: 8, maxHeight: .infinity)
                        }
                        if connectsToNext {
                            Color.clear.frame(height: PlanningTokens.PeriodBody.timelineGap)
                        }
                    }
                    .frame(width: PlanningTokens.PeriodBody.checkboxColumn)
                    if !node.children.isEmpty {
                        VStack(spacing: 0) {
                            ForEach(node.children) { child in
                                PeriodOverviewRow(node: child, square: true, showsIcon: false, action: open)
                            }
                        }
                        .padding(.leading, PlanningTokens.PeriodBody.subtaskIndent)
                    }
                }
            }
        }
    }
}

private struct PeriodEventRow: View {
    let node: PlanningNode
    let open: () -> Void

    var body: some View {
        PeriodOverviewRow(node: node, square: false, showsIcon: true, action: open)
    }
}

private struct PeriodTypeGlyph: View {
    let square: Bool
    let completed: Bool

    var body: some View {
        Group {
            if square {
                RoundedRectangle(cornerRadius: 3, style: .continuous)
                    .stroke(PlanningPalette.ink.opacity(0.7), lineWidth: 1.4)
                    .background {
                        if completed {
                            RoundedRectangle(cornerRadius: 3, style: .continuous).fill(PlanningPalette.accent.opacity(0.2))
                        }
                    }
                    .frame(width: 16, height: 16)
            } else {
                Image(systemName: completed ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 16))
                    .foregroundStyle(completed ? PlanningPalette.accent : PlanningPalette.ink.opacity(0.7))
            }
        }
    }
}

private struct PeriodOverviewRow: View {
    let node: PlanningNode
    let square: Bool
    let showsIcon: Bool
    let action: () -> Void

    var body: some View {
        Button(action: { PlanningTransition.perform(action) }) {
            HStack(alignment: .center, spacing: 8) {
                PeriodTypeGlyph(square: square, completed: node.completed)
                    .frame(width: PlanningTokens.PeriodBody.checkboxColumn, height: PlanningTokens.PeriodBody.rowHeight)
                if node.bucket == .daily, node.completed {
                    Text("完了")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(PlanningPalette.muted)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(node.title.isEmpty ? "無題" : node.title)
                        .font(.system(size: 15, weight: .regular))
                        .foregroundStyle(PlanningPalette.ink)
                        .lineLimit(1)
                    if let secondary = secondaryText {
                        Text(secondary)
                            .font(.system(size: 12))
                            .foregroundStyle(PlanningPalette.muted)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
                if showsIcon, let symbol = configuredSymbol {
                    Image(systemName: symbol)
                        .font(.system(size: 16, weight: .regular))
                        .foregroundStyle(PlanIconColor.resolved(node.colorID).color)
                        .frame(width: 22, height: 22)
                }
            }
            .frame(minHeight: PlanningTokens.PeriodBody.rowHeight)
        }
        .buttonStyle(.plain)
    }

    private var configuredSymbol: String? {
        guard showsIcon, !node.iconSymbol.isEmpty, node.iconSymbol != "circle" else { return nil }
        return node.iconSymbol
    }

    private var secondaryText: String? {
        guard let day = node.startDay else { return nil }
        if let minutes = node.startMinutes {
            return String(format: "%d日 %d:%02d", day, minutes / 60, minutes % 60)
        }
        return "\(day)日"
    }
}

private struct PeriodPickerSheet: View {
    @ObservedObject var session: PlanningSession
    let bucket: PlanningBucket
    let onClose: () -> Void
    @State private var pickedDate = Date()

    @State private var year = Calendar.current.component(.year, from: Date())
    @State private var month = Calendar.current.component(.month, from: Date())
    @State private var weekOffset = 0

    var body: some View {
        PlanningSheetChrome(onClose: onClose, onConfirm: apply, fixedHeight: bucket == .daily ? 460 : 280) {
            Group {
                if bucket == .monthly {
                    monthPicker
                } else if bucket == .weekly {
                    weekPicker
                } else {
                    DatePicker("日付", selection: $pickedDate, displayedComponents: .date)
                        .datePickerStyle(.graphical)
                        .labelsHidden()
                        .padding(.horizontal, 8)
                }
            }
        }
        .onAppear {
            pickedDate = PeriodCalendar.date(from: session.periodKey(for: bucket)) ?? Date()
            let parts = PeriodCalendar.monthParts(session.periodKey(for: .monthly))
            year = parts.year
            month = parts.month
            weekOffset = 0
        }
    }

    private var monthPicker: some View {
        HStack {
            Picker("年", selection: $year) {
                ForEach(2020...2036, id: \.self) { value in
                    Text(String(value)).tag(value)
                }
            }
            .pickerStyle(.wheel)
            Picker("月", selection: $month) {
                ForEach(1...12, id: \.self) { value in
                    Text("\(value)月").tag(value)
                }
            }
            .pickerStyle(.wheel)
        }
        .labelsHidden()
    }

    private var weekPicker: some View {
        let current = PeriodCalendar.date(from: session.periodKey(for: .weekly)) ?? Date()
        let base = PeriodCalendar.weekKey(containing: current)
        return Picker("週", selection: $weekOffset) {
            ForEach(-8...8, id: \.self) { offset in
                let key = PeriodCalendar.shift(base, bucket: .weekly, by: offset)
                Text(PeriodCalendar.label(bucket: .weekly, key: key)).tag(offset)
            }
        }
        .pickerStyle(.wheel)
        .labelsHidden()
    }

    private func apply() {
        switch bucket {
        case .monthly:
            session.assignPeriod(PeriodCalendar.monthKey(year: year, month: month), bucket: .monthly)
        case .weekly:
            let current = PeriodCalendar.date(from: session.periodKey(for: .weekly)) ?? Date()
            let key = PeriodCalendar.shift(PeriodCalendar.weekKey(containing: current), bucket: .weekly, by: weekOffset)
            session.assignPeriod(key, bucket: .weekly)
        case .daily:
            session.assignPeriod(PeriodCalendar.dayKey(pickedDate), bucket: .daily)
        }
        onClose()
    }
}

private struct RemovedPeriodAddSheet: View {
    @ObservedObject var session: PlanningSession
    let bucket: PlanningBucket
    let kind: PlanningItemKind
    let periodKey: String
    let onClose: () -> Void

    @State private var source: PeriodAddSource = .create
    @State private var draft = ""
    @State private var targetBucket: PlanningBucket

    init(session: PlanningSession, bucket: PlanningBucket, kind: PlanningItemKind, periodKey: String, onClose: @escaping () -> Void) {
        self.session = session
        self.bucket = bucket
        self.kind = kind
        self.periodKey = periodKey
        self.onClose = onClose
        _targetBucket = State(initialValue: bucket)
        _source = State(initialValue: PeriodCalendar.addSources(for: bucket).first ?? .create)
    }

    var body: some View {
        NativeSheetScaffold(title: "追加", onClose: onClose) {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Picker("追加元", selection: $source) {
                        ForEach(PeriodCalendar.addSources(for: bucket)) { item in
                            Text(item.title).tag(item)
                        }
                    }
                    .pickerStyle(.menu)
                    sourceBody
                    if !session.keepCandidates(for: bucket, before: periodKey).isEmpty {
                        Text("振り返りの維持")
                            .font(.headline)
                        ForEach(session.keepCandidates(for: bucket, before: periodKey)) { node in
                            Button(node.title) {
                                session.placeCopy(node.id, into: bucket, periodKey: periodKey)
                                onClose()
                            }
                        }
                    }
                }
                .padding(16)
            }
            .planningScroll()
        }
    }

    @ViewBuilder
    private var sourceBody: some View {
        switch source {
        case .create:
            TextField("内容", text: $draft)
                .textFieldStyle(.roundedBorder)
            Button("追加する") {
                session.addCreatedItem(title: draft, bucket: bucket, kind: kind, periodKey: periodKey)
                onClose()
            }
            .buttonStyle(.borderedProminent)
        case .plan:
            ForEach(session.plans.filter(\.hasBeenSaved)) { plan in
                Text(plan.title.isEmpty ? "無題のプラン" : plan.title)
                    .font(.headline)
                PlanBulletImportList(session: session, bullets: plan.bullets, bucket: bucket, kind: kind, periodKey: periodKey, onClose: onClose)
            }
        case .postpone:
            Picker("期間", selection: $targetBucket) {
                Text("Monthly").tag(PlanningBucket.monthly)
                Text("Weekly").tag(PlanningBucket.weekly)
                Text("Daily").tag(PlanningBucket.daily)
            }
            ForEach(session.postponed.filter { $0.kind == kind }) { entry in
                Button(entry.title) {
                    let key = targetBucket == bucket ? periodKey : session.periodKey(for: targetBucket)
                    if session.retrievePostponed(entry.id, into: targetBucket, periodKey: key) {
                        onClose()
                    }
                }
            }
        case .monthly:
            ForEach(session.periodItems.filter { $0.bucket == .monthly && $0.kind == kind }) { node in
                Button(node.title) {
                    if kind == .task {
                        session.copyMonthlyTasks([node.id], toWeeklyPeriod: periodKey)
                    } else if let eventID = node.eventID {
                        session.linkWeeklyEvent(eventID, weekKey: periodKey)
                    }
                    onClose()
                }
            }
        case .periods:
            ForEach(session.periodItems.filter { ($0.bucket == .monthly || $0.bucket == .weekly) && $0.kind == kind }) { node in
                Button("\(node.bucket.title) · \(node.title)") {
                    session.placeCopy(node.id, into: .daily, periodKey: periodKey)
                    onClose()
                }
            }
        }
    }
}

private struct PlanBulletImportList: View {
    @ObservedObject var session: PlanningSession
    let bullets: [PlanBullet]
    let bucket: PlanningBucket
    let kind: PlanningItemKind
    let periodKey: String
    let onClose: () -> Void

    var body: some View {
        ForEach(bullets) { bullet in
            Button(bullet.text.isEmpty ? "無題" : bullet.text) {
                guard let target = transferTarget else { return }
                session.transfer(planID: planID(containing: bullet.id), bulletIDs: [bullet.id], includeChildren: true, to: target)
                onClose()
            }
            .disabled(transferTarget == nil)
            PlanBulletImportList(session: session, bullets: bullet.children, bucket: bucket, kind: kind, periodKey: periodKey, onClose: onClose)
        }
    }

    private var transferTarget: PlanTransferTarget? {
        switch (bucket, kind) {
        case (.monthly, .task): .monthlyTask
        case (.monthly, .event): .monthlyEvent
        case (.weekly, .task): .weeklyTask
        case (.weekly, .event): .weeklyEvent
        case (.daily, .task): .dailyTask
        case (.daily, .event): .dailyEvent
        default: nil
        }
    }

    private func planID(containing bulletID: UUID) -> UUID {
        session.plans.first { planContains($0.bullets, bulletID) }?.id ?? UUID()
    }

    private func planContains(_ bullets: [PlanBullet], _ id: UUID) -> Bool {
        bullets.contains { $0.id == id || planContains($0.children, id) }
    }
}
