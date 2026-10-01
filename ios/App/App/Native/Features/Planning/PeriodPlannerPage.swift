import SwiftUI

struct PeriodPlannerPage: View {
    @ObservedObject var session: PlanningSession
    @EnvironmentObject private var navigation: TabNavigationState
    let bucket: PlanningBucket

    @State private var showingPicker = false
    @State private var addingKind: PlanningItemKind?

    private var periodKey: String { session.periodKey(for: bucket) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                periodBar
                if bucket == .weekly {
                    Button("Weeklyをなくす") {
                        navigation.path.append(PlanningRoute.weeklySettings)
                    }
                    .buttonStyle(.bordered)
                }
                if bucket == .monthly {
                    monthlyGoal
                }
                periodBody
            }
            .padding(16)
        }
        .onAppear {
            session.refreshDue(ReflectionScope.period(bucket, periodKey))
        }
        .gesture(
            DragGesture(minimumDistance: 24)
                .onEnded { value in
                    if value.translation.width <= -40 {
                        session.shiftPeriod(bucket, by: 1)
                    } else if value.translation.width >= 40 {
                        session.shiftPeriod(bucket, by: -1)
                    }
                }
        )
        .nativeSheet(isPresented: $showingPicker, detents: [.medium, .large]) {
            PeriodPickerSheet(session: session, bucket: bucket) { showingPicker = false }
        }
        .nativeSheet(
            isPresented: Binding(
                get: { addingKind != nil },
                set: { if !$0 { addingKind = nil } }
            ),
            detents: [.large]
        ) {
            if let addingKind {
                PeriodAddSheet(session: session, bucket: bucket, kind: addingKind, periodKey: periodKey) {
                    self.addingKind = nil
                }
            }
        }
    }

    private var periodBar: some View {
        HStack(spacing: 8) {
            PlanningGlyph(section: bucket.section)
            Button {
                session.shiftPeriod(bucket, by: -1)
            } label: {
                Image(systemName: "chevron.left").frame(width: 44, height: 44)
            }
            Button {
                showingPicker = true
            } label: {
                Text(PeriodCalendar.label(bucket: bucket, key: periodKey))
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
    private var periodBody: some View {
        let scope = ReflectionScope.period(bucket, periodKey)
        let reflected = session.isReflectionComplete(bucket: bucket, periodKey: periodKey)
        let editing = session.isExplicitEdit(bucket: bucket, periodKey: periodKey)
        if reflected {
            ReflectionResultView(session: session, scope: scope)
        }
        if !reflected || editing {
            if !reflected, !session.existingRecord(bucket: bucket, periodKey: periodKey).hasMeaningfulActivity {
                NoActivityMemorySection(session: session, scope: scope)
            }
            if !reflected, session.isActivePrompt(scope) {
                Button("振り返りを始めますか？") {
                    session.refreshDue(scope)
                    navigation.path.append(PlanningRoute.reflection(scope))
                }
                .buttonStyle(.borderedProminent)
            }
            itemSection(.task)
            itemSection(.event)
        }
    }

    private var monthlyGoal: some View {
        let parts = PeriodCalendar.monthParts(periodKey)
        return VStack(alignment: .leading, spacing: 6) {
            Text("月の目標")
                .font(.headline)
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

    private func itemSection(_ kind: PlanningItemKind) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(kind == .task ? "ToDo" : "予定")
                    .font(.title3.weight(.semibold))
                Spacer()
                Button("追加") { addingKind = kind }
                    .buttonStyle(.bordered)
            }
            let nodes = session.nodes(bucket: bucket, periodKey: periodKey, kind: kind)
            if nodes.isEmpty {
                Text("まだありません")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            ForEach(nodes) { node in
                PeriodNodeRow(session: session, node: node, bucket: bucket, depth: 0)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct PeriodNodeRow: View {
    @ObservedObject var session: PlanningSession
    let node: PlanningNode
    let bucket: PlanningBucket
    let depth: Int
    @State private var childTitle = ""

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
            if depth < PlanningRules.maximumDepth - 1 {
                HStack {
                    TextField("サブタスク", text: $childTitle)
                        .textFieldStyle(.roundedBorder)
                    Button("追加") {
                        session.addChild(to: node.id, title: childTitle)
                        childTitle = ""
                    }
                    .disabled(childTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                .font(.caption)
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

    var body: some View {
        NativeSheetScaffold(title: pickerTitle, onClose: onClose, onConfirm: apply) {
            Group {
                if bucket == .monthly {
                    monthPicker
                } else if bucket == .weekly {
                    weekPicker
                } else {
                    DatePicker("日付", selection: $pickedDate, displayedComponents: .date)
                        .datePickerStyle(.graphical)
                        .padding()
                }
            }
        .onAppear {
            session.refreshDue(ReflectionScope.period(bucket, session.periodKey(for: bucket)))
            pickedDate = PeriodCalendar.date(from: session.periodKey(for: bucket)) ?? Date()
        }
        }
    }

    private var pickerTitle: LocalizedStringKey {
        switch bucket {
        case .monthly: "月を選ぶ"
        case .weekly: "週を選ぶ"
        case .daily: "日を選ぶ"
        }
    }

    private var monthPicker: some View {
        let parts = PeriodCalendar.monthParts(session.periodKey(for: .monthly))
        return VStack {
            Stepper("\(parts.year)年", value: Binding(
                get: { parts.year },
                set: { session.assignPeriod(PeriodCalendar.monthKey(year: $0, month: parts.month), bucket: .monthly) }
            ))
            LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 3), spacing: 8) {
                ForEach(1...12, id: \.self) { month in
                    Button("\(month)月") {
                        session.assignPeriod(PeriodCalendar.monthKey(year: parts.year, month: month), bucket: .monthly)
                        onClose()
                    }
                    .buttonStyle(.bordered)
                }
            }
            .padding()
        }
        .padding()
    }

    private var weekPicker: some View {
        let current = PeriodCalendar.date(from: session.periodKey(for: .weekly)) ?? Date()
        return ScrollView {
            VStack(spacing: 8) {
                ForEach(-8...8, id: \.self) { offset in
                    let key = PeriodCalendar.shift(PeriodCalendar.weekKey(containing: current), bucket: .weekly, by: offset)
                    Button(PeriodCalendar.label(bucket: .weekly, key: key)) {
                        session.assignPeriod(key, bucket: .weekly)
                        onClose()
                    }
                    .buttonStyle(.bordered)
                }
            }
            .padding()
        }
    }

    private func apply() {
        switch bucket {
        case .monthly:
            break
        case .weekly:
            session.assignPeriod(PeriodCalendar.weekKey(containing: pickedDate), bucket: .weekly)
        case .daily:
            session.assignPeriod(PeriodCalendar.dayKey(pickedDate), bucket: .daily)
        }
        onClose()
    }
}

private struct PeriodAddSheet: View {
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
