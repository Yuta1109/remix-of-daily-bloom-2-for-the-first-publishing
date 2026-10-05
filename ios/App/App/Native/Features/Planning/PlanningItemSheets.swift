import SwiftUI

struct PlanningSubtaskDraft: Identifiable, Equatable {
    var id = UUID()
    var title = ""
    var startMinutes: Int?
    var endMinutes: Int?
}

struct PlanningItemDraft: Equatable {
    var title = ""
    var iconSymbol = "circle"
    var colorID = PlanIconColor.defaultID
    var startDay: Int?
    var endDay: Int?
    var startMinutes: Int?
    var endMinutes: Int?
    var subtasks: [PlanningSubtaskDraft] = []

    init(node: PlanningNode) {
        title = node.title
        iconSymbol = node.iconSymbol
        colorID = node.colorID
        startDay = node.startDay
        endDay = node.endDay
        startMinutes = node.startMinutes
        endMinutes = node.endMinutes
        subtasks = node.children.map {
            PlanningSubtaskDraft(id: $0.id, title: $0.title, startMinutes: $0.startMinutes, endMinutes: $0.endMinutes)
        }
    }

    init() {}
}

enum PlanningColorChoice: String, CaseIterable, Identifiable {
    case sand, blush, sage, sky, butter, lilac, peach, mist
    var id: String { rawValue }
    var color: Color {
        switch self {
        case .sand: PlanningPalette.card
        case .blush: PlanningPalette.plan
        case .sage: PlanningPalette.future
        case .sky: PlanningPalette.monthly
        case .butter: PlanningPalette.todo
        case .lilac: PlanningPalette.event
        case .peach: PlanningPalette.daily
        case .mist: PlanningPalette.weekly
        }
    }
}

enum PlanningIconCatalog {
    static let symbols = [
        "briefcase", "book", "house", "cart", "heart", "airplane", "phone", "yensign.circle",
        "figure.run", "fork.knife", "bell", "calendar", "doc.text", "pencil", "leaf",
        "bed.double", "tram", "gift", "music.note", "star"
    ]
}

enum PlanningRangeText {
    static func display(startDay: Int?, endDay: Int?, startMinutes: Int?, endMinutes: Int?) -> String {
        let start = piece(day: startDay, minutes: startMinutes)
        let end = piece(day: endDay, minutes: endMinutes)
        if start.isEmpty && end.isEmpty { return "" }
        if end.isEmpty { return start }
        if start.isEmpty { return end }
        return "\(start)～\(end)"
    }

    private static func piece(day: Int?, minutes: Int?) -> String {
        var parts: [String] = []
        if let day { parts.append("\(day)日") }
        if let minutes { parts.append(String(format: "%02d:%02d", minutes / 60, minutes % 60)) }
        return parts.joined(separator: " ")
    }
}

enum PlanningRowEntry {
    static func shouldAppendNextRow(_ text: String) -> Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

enum PlanningSelection {
    static func afterToggle(id: UUID, bullets: [PlanBullet], selected: Set<UUID>) -> Set<UUID> {
        var next = selected
        if let parent = bullets.first(where: { $0.id == id }) {
            if next.contains(id) {
                next.remove(id)
                parent.children.forEach { next.remove($0.id) }
            } else {
                next.insert(id)
                parent.children.forEach { next.insert($0.id) }
            }
            return next
        }
        if next.contains(id) { next.remove(id) } else { next.insert(id) }
        return next
    }
}

struct PeriodItemListSheet: View {
    @ObservedObject var session: PlanningSession
    let bucket: PlanningBucket
    let periodKey: String
    @State private var kind: PlanningItemKind
    @State private var showingSources = false
    @State private var editingID: EditingNodeID?
    @State private var creating = false
    @Environment(\.dismiss) private var dismiss

    init(session: PlanningSession, bucket: PlanningBucket, kind: PlanningItemKind, periodKey: String) {
        self.session = session
        self.bucket = bucket
        self.periodKey = periodKey
        _kind = State(initialValue: kind)
    }

    var body: some View {
        PlanningSystemSheetChrome(
            onClose: { dismiss() },
            onConfirm: { dismiss() },
            maximumBody: PlanningTokens.Sheet.maximumBody,
            bodySurface: Color.white
        ) {
            VStack(alignment: .leading, spacing: 10) {
                Picker("種類", selection: $kind) {
                    Text("ToDo").tag(PlanningItemKind.task)
                    Text("予定").tag(PlanningItemKind.event)
                }
                .pickerStyle(.segmented)
                ForEach(session.nodes(bucket: bucket, periodKey: periodKey, kind: kind)) { node in
                    parentRow(node)
                }
            }
            .padding(16)
            .padding(.bottom, 72)
        }
        .overlay(alignment: .bottomTrailing) {
            NativeGlassIconButton(icon: .plus, accessibilityLabel: "Add", prominent: true) {
                showingSources = true
            }
            .padding(16)
        }
        .sheet(isPresented: $showingSources) {
            PeriodSourceChooser(session: session, bucket: bucket, kind: kind, periodKey: periodKey) {
                showingSources = false
            } onCreate: {
                showingSources = false
                creating = true
            }
        }
        .sheet(isPresented: $creating) {
            PlanningItemEditorSheet(draft: PlanningItemDraft(), bucket: bucket, kind: kind, periodKey: periodKey) { draft in
                session.saveItem(existingID: nil, draft: draft, bucket: bucket, kind: kind, periodKey: periodKey)
                creating = false
            } onClose: { creating = false }
        }
        .sheet(item: $editingID) { editing in
            if let node = session.findNode(editing.id) {
                PlanningItemEditorSheet(draft: PlanningItemDraft(node: node), bucket: bucket, kind: kind, periodKey: periodKey) { draft in
                    session.saveItem(existingID: editing.id, draft: draft, bucket: bucket, kind: kind, periodKey: periodKey)
                    editingID = nil
                } onClose: { editingID = nil }
            }
        }
    }

    private func parentRow(_ node: PlanningNode) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            itemRow(node, showsIcon: true)
            ForEach(node.children) { child in
                itemRow(child, showsIcon: false)
                    .padding(.leading, 22)
            }
        }
        .padding(10)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(PlanningPalette.line, lineWidth: 1))
    }

    private func itemRow(_ node: PlanningNode, showsIcon: Bool) -> some View {
        HStack(alignment: .top, spacing: 8) {
            statusControl(node)
            Button {
                editingID = EditingNodeID(id: showsIcon ? node.id : parentID(containing: node.id) ?? node.id)
            } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text(node.title).foregroundStyle(PlanningPalette.ink)
                    let range = PlanningRangeText.display(startDay: node.startDay, endDay: node.endDay, startMinutes: node.startMinutes, endMinutes: node.endMinutes)
                    if !range.isEmpty {
                        Text(range).font(.caption).foregroundStyle(PlanningPalette.muted)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)
            if showsIcon {
                Image(systemName: node.iconSymbol)
                    .foregroundStyle(PlanIconColor.resolved(node.colorID).color)
            }
        }
    }

    @ViewBuilder
    private func statusControl(_ node: PlanningNode) -> some View {
        if kind == .event {
            EmptyView()
        } else if PeriodCalendar.allowsCompletionToggle(bucket) {
            Button {
                _ = session.setCompleted(nodeID: node.id, completed: !node.completed)
            } label: {
                Image(systemName: node.completed ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(PlanningPalette.accent)
            }
            .buttonStyle(.plain)
        } else {
            Image(systemName: node.completed ? "checkmark.circle.fill" : "circle")
                .foregroundStyle(PlanningPalette.muted)
                .accessibilityLabel("Today completion")
        }
    }

    private func parentID(containing childID: UUID) -> UUID? {
        session.nodes(bucket: bucket, periodKey: periodKey, kind: kind).first { $0.children.contains { $0.id == childID } }?.id
    }
}

struct EditingNodeID: Identifiable {
    let id: UUID
}

struct PeriodSourceChooser: View {
    @ObservedObject var session: PlanningSession
    let bucket: PlanningBucket
    let kind: PlanningItemKind
    let periodKey: String
    let onClose: () -> Void
    let onCreate: () -> Void
    @State private var picking: PeriodAddSource?

    var body: some View {
        PlanningSystemSheetChrome(onClose: onClose, onConfirm: onClose) {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(PeriodCalendar.addSources(for: bucket)) { source in
                    Button(source.title) {
                        if source == .create { onCreate() } else { picking = source }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                }
            }
        }
        .sheet(item: $picking) { source in
            PeriodSourceSelectionSheet(session: session, source: source, bucket: bucket, kind: kind, periodKey: periodKey) {
                picking = nil
                onClose()
            }
        }
    }
}

struct PeriodSourceSelectionSheet: View {
    @ObservedObject var session: PlanningSession
    let source: PeriodAddSource
    let bucket: PlanningBucket
    let kind: PlanningItemKind
    let periodKey: String
    let onClose: () -> Void
    @State private var selected: Set<UUID> = []

    var body: some View {
        PlanningSystemSheetChrome(
            onClose: onClose,
            onConfirm: {
                session.importSources(selected, source: source, bucket: bucket, kind: kind, periodKey: periodKey)
                onClose()
            },
            maximumBody: PlanningTokens.Sheet.maximumBody
        ) {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(rows, id: \.id) { row in
                    Button {
                        if selected.contains(row.id) { selected.remove(row.id) } else { selected.insert(row.id) }
                    } label: {
                        HStack {
                            Image(systemName: selected.contains(row.id) ? "checkmark.square.fill" : "square")
                            Text(row.title).foregroundStyle(PlanningPalette.ink)
                            Spacer()
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(16)
        }
    }

    private var rows: [(id: UUID, title: String)] {
        switch source {
        case .plan:
            session.plans.filter(\.hasBeenSaved).flatMap { plan in
                plan.bullets.flatMap { bullet in
                    [(bullet.id, bullet.text.isEmpty ? "無題" : bullet.text)] + bullet.children.map { ($0.id, $0.text) }
                }
            }
        case .postpone:
            session.postponed.filter { $0.kind == kind }.map { ($0.id, $0.title) }
        case .monthly:
            session.nodes(bucket: .monthly, periodKey: session.periodKey(for: .monthly), kind: kind).map { ($0.id, $0.title) }
        case .periods:
            session.periodItems.filter { ($0.bucket == .monthly || $0.bucket == .weekly) && $0.kind == kind }.map { ($0.id, $0.title) }
        case .create:
            []
        }
    }
}

struct PlanningItemEditorSheet: View {
    @State var draft: PlanningItemDraft
    let bucket: PlanningBucket
    let kind: PlanningItemKind
    let periodKey: String
    let onSave: (PlanningItemDraft) -> Void
    let onClose: () -> Void
    @State private var original: PlanningItemDraft
    @State private var confirmDiscard = false
    @FocusState private var focusedSubtask: UUID?

    init(draft: PlanningItemDraft, bucket: PlanningBucket, kind: PlanningItemKind, periodKey: String, onSave: @escaping (PlanningItemDraft) -> Void, onClose: @escaping () -> Void) {
        self.bucket = bucket
        self.kind = kind
        self.periodKey = periodKey
        self.onSave = onSave
        self.onClose = onClose
        _draft = State(initialValue: draft)
        _original = State(initialValue: draft)
    }

    var body: some View {
        PlanningSystemSheetChrome(
            onClose: requestClose,
            onConfirm: { onSave(draft) },
            centerTitle: kind == .task ? "ToDo" : "予定",
            maximumBody: PlanningTokens.Sheet.maximumBody,
            bodySurface: Color.white
        ) {
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 10) {
                    Image(systemName: draft.iconSymbol)
                        .foregroundStyle(PlanIconColor.resolved(draft.colorID).color)
                        .frame(width: 28)
                    TextField("内容", text: $draft.title)
                }
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        ForEach(PlanningIconCatalog.symbols, id: \.self) { symbol in
                            Button { draft.iconSymbol = symbol } label: {
                                Image(systemName: symbol)
                                    .foregroundStyle(PlanIconColor.resolved(draft.colorID).color)
                                    .frame(width: 32, height: 32)
                                    .background(draft.iconSymbol == symbol ? PlanningPalette.line : Color.clear, in: Circle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                HStack {
                    ForEach(PlanIconColor.allCases) { choice in
                        Button { draft.colorID = choice.rawValue } label: {
                            Circle().fill(choice.color).frame(width: 22, height: 22)
                                .overlay(Circle().stroke(draft.colorID == choice.rawValue ? PlanningPalette.ink : PlanningPalette.line, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                    }
                }
                rangeEditors
                if kind == .task {
                    Text("サブタスク").font(.caption.weight(.semibold)).foregroundStyle(PlanningPalette.muted)
                    ForEach($draft.subtasks) { $subtask in
                        TextField("サブタスク", text: $subtask.title)
                            .focused($focusedSubtask, equals: subtask.id)
                            .onSubmit { appendSubtask(after: subtask) }
                    }
                }
            }
            .padding(16)
        }
        .planningKeyboardDismiss()
        .onAppear {
            if kind == .task, draft.subtasks.isEmpty { draft.subtasks = [PlanningSubtaskDraft()] }
            original = draft
        }
        .onChange(of: confirmDiscard) { _, show in
            guard show else { return }
            confirmDiscard = false
            PlanningDiscardConfirmation.present { onClose() }
        }
    }

    @ViewBuilder
    private var rangeEditors: some View {
        if bucket != .daily {
            Stepper("開始日 \(draft.startDay ?? 1)", value: dayBinding(\.startDay), in: 1...31)
            Stepper("終了日 \(draft.endDay ?? draft.startDay ?? 1)", value: dayBinding(\.endDay), in: 1...31)
        }
        Toggle("開始時刻", isOn: minutesToggle(\.startMinutes, defaultValue: 9 * 60))
        if draft.startMinutes != nil {
            Stepper(clock(draft.startMinutes ?? 0), value: minutesBinding(\.startMinutes), in: 0...(23 * 60 + 59), step: 15)
        }
        Toggle("終了時刻", isOn: minutesToggle(\.endMinutes, defaultValue: 10 * 60))
        if draft.endMinutes != nil {
            Stepper(clock(draft.endMinutes ?? 0), value: minutesBinding(\.endMinutes), in: 0...(23 * 60 + 59), step: 15)
        }
        Text(PlanningRangeText.display(startDay: draft.startDay, endDay: draft.endDay, startMinutes: draft.startMinutes, endMinutes: draft.endMinutes))
            .font(.caption)
            .foregroundStyle(PlanningPalette.muted)
    }

    private func appendSubtask(after subtask: PlanningSubtaskDraft) {
        guard PlanningRowEntry.shouldAppendNextRow(subtask.title) else { return }
        let next = PlanningSubtaskDraft()
        draft.subtasks.append(next)
        focusedSubtask = next.id
    }

    private func dayBinding(_ keyPath: WritableKeyPath<PlanningItemDraft, Int?>) -> Binding<Int> {
        Binding(get: { draft[keyPath: keyPath] ?? 1 }, set: { draft[keyPath: keyPath] = $0 })
    }

    private func minutesBinding(_ keyPath: WritableKeyPath<PlanningItemDraft, Int?>) -> Binding<Int> {
        Binding(get: { draft[keyPath: keyPath] ?? 0 }, set: { draft[keyPath: keyPath] = $0 })
    }

    private func minutesToggle(_ keyPath: WritableKeyPath<PlanningItemDraft, Int?>, defaultValue: Int) -> Binding<Bool> {
        Binding(
            get: { draft[keyPath: keyPath] != nil },
            set: { draft[keyPath: keyPath] = $0 ? defaultValue : nil }
        )
    }

    private func clock(_ minutes: Int) -> String {
        String(format: "%02d:%02d", minutes / 60, minutes % 60)
    }

    private func requestClose() {
        if draft != original { confirmDiscard = true } else { onClose() }
    }
}
