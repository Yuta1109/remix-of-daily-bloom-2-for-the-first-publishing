import SwiftUI

struct PeriodPlannerPage: View {
    @ObservedObject var session: PlanningSession
    @EnvironmentObject private var navigation: TabNavigationState
    let bucket: PlanningBucket

    @State private var showingPicker = false
    @State private var addingKind: PlanningItemKind?

    private var periodKey: String { session.periodKey(for: bucket) }

    var body: some View {
        TabView(selection: periodSelection) {
            ForEach(pageKeys, id: \.self) { key in
                periodPage(key).tag(key)
            }
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .background(PlanningPalette.paper)
        .onAppear {
            session.refreshDue(ReflectionScope.period(bucket, periodKey))
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
            VStack(alignment: .leading, spacing: 18) {
                if bucket == .weekly {
                    Button("Weeklyをなくす") {
                        navigation.path.append(PlanningRoute.weeklySettings)
                    }
                    .buttonStyle(.bordered)
                }
                if bucket == .monthly {
                    monthlyGoal(key)
                }
                periodBody(key)
            }
            .padding(16)
        }
        .planningScroll()
        .planningKeyboardDismiss()
        .planningFixedHeader {
            periodBar(key)
                .padding(.horizontal, 16)
                .padding(.top, PlanningTokens.PlanMain.titleTop)
        }
        .background(PlanningPalette.paper)
    }

    private func periodBar(_ key: String) -> some View {
        HStack(spacing: 8) {
            PlanningHeadingIconSlot()
            Button {
                session.shiftPeriod(bucket, by: -1)
            } label: {
                Image(systemName: "chevron.left").frame(width: 44, height: 44)
            }
            Button {
                showingPicker = true
            } label: {
                Text(PeriodCalendar.label(bucket: bucket, key: key))
                    .foregroundStyle(PlanningPalette.ink)
                    .font(.title3.bold())
                    .frame(minHeight: 44)
            }
            Button {
                session.shiftPeriod(bucket, by: 1)
            } label: {
                Image(systemName: "chevron.right").frame(width: 44, height: 44)
            }
            Spacer(minLength: 0)
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func periodBody(_ key: String) -> some View {
        let scope = ReflectionScope.period(bucket, key)
        let reflected = session.isReflectionComplete(bucket: bucket, periodKey: key)
        let editing = session.isExplicitEdit(bucket: bucket, periodKey: key)
        let elapsed = PeriodCalendar.periodHasEnded(bucket, key: key)
        let inactive = !session.existingRecord(bucket: bucket, periodKey: key).hasMeaningfulActivity
        if reflected {
            ReflectionResultView(session: session, scope: scope)
        }
        if !reflected || editing {
            if !reflected, elapsed, inactive {
                NoActivityMemorySection(session: session, scope: scope)
            } else {
                if !reflected, session.isActivePrompt(scope) {
                    Button("振り返りを始めますか？") {
                        session.refreshDue(scope)
                        navigation.path.append(PlanningRoute.reflection(scope))
                    }
                    .buttonStyle(.borderedProminent)
                }
                itemSection(.task, key: key)
                itemSection(.event, key: key)
            }
        }
    }

    private func monthlyGoal(_ key: String) -> some View {
        let parts = PeriodCalendar.monthParts(key)
        return VStack(alignment: .leading, spacing: 6) {
            Text("今月の目標")
                .font(.headline)
                .foregroundStyle(PlanningPalette.ink)
            TextField(
                "目標は1つ",
                text: Binding(
                    get: { session.goal(year: parts.year, month: parts.month) },
                    set: { session.setGoal($0, year: parts.year, month: parts.month) }
                )
            )
            .textFieldStyle(.roundedBorder)
        }
    }

    private func itemSection(_ kind: PlanningItemKind, key: String) -> some View {
        let card = bucket == .daily
            ? PlanningPalette.card
            : (kind == .task ? PlanningPalette.todo : PlanningPalette.event)
        return VStack(alignment: .leading, spacing: 10) {
            Text(sectionTitle(kind))
                .font(.title3.weight(.semibold))
                .foregroundStyle(PlanningPalette.ink)
            let nodes = session.nodes(bucket: bucket, periodKey: key, kind: kind)
            if nodes.isEmpty {
                Text("まだありません")
                    .font(.subheadline)
                    .foregroundStyle(PlanningPalette.muted)
            }
            ForEach(nodes) { node in
                VStack(alignment: .leading, spacing: 4) {
                    Text(node.title).foregroundStyle(PlanningPalette.ink)
                    let range = PlanningRangeText.display(startDay: node.startDay, endDay: node.endDay, startMinutes: node.startMinutes, endMinutes: node.endMinutes)
                    if !range.isEmpty {
                        Text(range).font(.caption).foregroundStyle(PlanningPalette.muted)
                    }
                    ForEach(node.children) { child in
                        Text(child.title)
                            .font(.subheadline)
                            .foregroundStyle(PlanningPalette.muted)
                            .padding(.leading, 16)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(PlanningPalette.line, lineWidth: 1))
        .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .onTapGesture { addingKind = kind }
    }

    private func sectionTitle(_ kind: PlanningItemKind) -> String {
        if bucket == .daily {
            return kind == .task ? "今日のタスク" : "予定"
        }
        return kind == .task ? "ToDo" : "予定"
    }
}

private struct PeriodNodeRow: View {
    @ObservedObject var session: PlanningSession
    let node: PlanningNode
    let bucket: PlanningBucket
    let depth: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .center, spacing: 8) {
                leadingMark
                TextField("項目", text: Binding(
                    get: { node.title },
                    set: { session.renameNode(node.id, title: $0) }
                ))
                .padding(.leading, CGFloat(depth) * 14)
                Button("削除", role: .destructive) { session.deleteNode(node.id) }
                    .font(.caption)
                    .buttonStyle(.borderless)
            }
            ForEach(node.children) { child in
                PeriodNodeRow(session: session, node: child, bucket: bucket, depth: depth + 1)
            }
        }
    }

    @ViewBuilder
    private var leadingMark: some View {
        if bucket == .daily {
            if depth == 0 {
                PeriodTypeGlyph(kind: node.kind)
                if node.completed {
                    Text("完了")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
            }
        } else if PeriodCalendar.allowsCompletionToggle(bucket) {
            Button {
                _ = session.setCompleted(nodeID: node.id, completed: !node.completed)
            } label: {
                Image(systemName: node.completed ? "checkmark.circle.fill" : "circle")
                    .frame(width: 32, height: 32)
            }
            .buttonStyle(.plain)
        }
    }
}

private struct PeriodTypeGlyph: View {
    let kind: PlanningItemKind

    var body: some View {
        Group {
            if kind == .task {
                RoundedRectangle(cornerRadius: 2, style: .continuous)
                    .stroke(Color.primary, lineWidth: 1.4)
            } else {
                Capsule().stroke(Color.primary, lineWidth: 1.4)
            }
        }
        .frame(width: 14, height: 14)
        .accessibilityLabel(kind == .task ? "Task" : "Event")
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
