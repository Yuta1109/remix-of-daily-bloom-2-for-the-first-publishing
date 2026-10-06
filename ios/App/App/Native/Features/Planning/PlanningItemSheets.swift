import SwiftUI
import UIKit

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
    @State private var picking: PeriodAddSource?
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
            onConfirm: { showingSources = true },
            centerTitle: "ToDo・予定",
            maximumBody: PlanningTokens.Sheet.maximumBody,
            bodySurface: Color.white,
            confirmIcon: .plus
        ) {
            VStack(alignment: .leading, spacing: 8) {
                Picker("種類", selection: $kind) {
                    Text("ToDo").tag(PlanningItemKind.task)
                    Text("予定").tag(PlanningItemKind.event)
                }
                .pickerStyle(.segmented)
                .frame(height: 36)
                let nodes = session.nodes(bucket: bucket, periodKey: periodKey, kind: kind)
                ForEach(Array(nodes.enumerated()), id: \.element.id) { index, node in
                    parentTimelineRow(node, connectsToNext: index < nodes.count - 1)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 16)
        }
        .popover(isPresented: $showingSources, attachmentAnchor: .point(.topTrailing), arrowEdge: .top) {
            PeriodSourcePopover(bucket: bucket) { source in
                showingSources = false
                PlanningTransition.perform {
                    if source == .create { creating = true } else { picking = source }
                }
            }
            .presentationCompactAdaptation(.popover)
        }
        .sheet(isPresented: $creating) {
            PlanningItemEditorSheet(draft: PlanningItemDraft(), isNew: true, bucket: bucket, kind: kind, periodKey: periodKey) { draft in
                session.saveItem(existingID: nil, draft: draft, bucket: bucket, kind: kind, periodKey: periodKey)
                creating = false
            } onClose: { creating = false }
        }
        .sheet(item: $editingID) { editing in
            if let node = session.findNode(editing.id) {
                PlanningItemEditorSheet(draft: PlanningItemDraft(node: node), isNew: false, bucket: bucket, kind: kind, periodKey: periodKey) { draft in
                    session.saveItem(existingID: editing.id, draft: draft, bucket: bucket, kind: kind, periodKey: periodKey)
                    editingID = nil
                } onClose: { editingID = nil }
            }
        }
        .sheet(item: $picking) { source in
            PeriodSourceSelectionSheet(session: session, source: source, bucket: bucket, kind: kind, periodKey: periodKey) {
                picking = nil
            }
        }
    }

    private func parentTimelineRow(_ node: PlanningNode, connectsToNext: Bool) -> some View {
        HStack(alignment: .top, spacing: 8) {
            VStack(spacing: 0) {
                completionControl(node)
                    .frame(width: 20, height: 20)
                    .padding(.top, 14)
                if connectsToNext {
                    Color.clear.frame(height: PlanningTokens.PeriodBody.timelineGap)
                    Rectangle()
                        .fill(PlanningPalette.line)
                        .frame(width: PlanningTokens.PeriodBody.timelineWidth, height: timelineSpan(node))
                    Color.clear.frame(height: PlanningTokens.PeriodBody.timelineGap)
                }
            }
            .frame(width: PlanningTokens.PeriodBody.checkboxColumn)
            VStack(alignment: .leading, spacing: 0) {
                rowContent(node, showsIcon: true, opens: node.id)
                ForEach(node.children) { child in
                    rowContent(child, showsIcon: false, opens: node.id)
                        .padding(.leading, PlanningTokens.ReflectionSummary.listSubtaskIndent)
                }
            }
        }
    }

    private func timelineSpan(_ node: PlanningNode) -> CGFloat {
        CGFloat(max(node.children.count, 1)) * PlanningTokens.ReflectionSummary.listRowHeight
    }

    private func rowContent(_ node: PlanningNode, showsIcon: Bool, opens parent: UUID) -> some View {
        HStack(alignment: .center, spacing: 8) {
            if !showsIcon {
                completionControl(node)
                    .frame(width: 20, height: 20)
            }
            Button {
                editingID = EditingNodeID(id: parent)
            } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text(node.title).foregroundStyle(PlanningPalette.ink).lineLimit(1)
                    let range = PlanningRangeText.display(startDay: node.startDay, endDay: node.endDay, startMinutes: node.startMinutes, endMinutes: node.endMinutes)
                    if !range.isEmpty {
                        Text(range).font(.caption).foregroundStyle(PlanningPalette.muted)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)
            if showsIcon, !node.iconSymbol.isEmpty, node.iconSymbol != "circle" {
                Image(systemName: node.iconSymbol)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(PlanIconColor.resolved(node.colorID).color)
                    .frame(width: 28, height: 28)
            }
        }
        .frame(minHeight: PlanningTokens.ReflectionSummary.listRowHeight)
    }

    private func completionControl(_ node: PlanningNode) -> some View {
        let allowsEdit = PeriodCalendar.allowsCompletionToggle(bucket)
        let symbol = kind == .event
            ? (node.completed ? "checkmark.circle.fill" : "circle")
            : (node.completed ? "checkmark.square.fill" : "square")
        return Button {
            _ = session.setCompleted(nodeID: node.id, completed: !node.completed)
        } label: {
            Image(systemName: symbol)
                .font(.system(size: 18))
                .foregroundStyle(node.completed ? PlanningPalette.accent : PlanningPalette.muted)
        }
        .buttonStyle(.plain)
        .disabled(!allowsEdit)
        .accessibilityLabel(bucket == .daily ? "Today completion" : "Completion")
    }
}

struct PeriodSourcePopover: View {
    let bucket: PlanningBucket
    let onSelect: (PeriodAddSource) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(PeriodCalendar.addSources(for: bucket)) { source in
                Button {
                    onSelect(source)
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: icon(source))
                        Text(source.title)
                            .foregroundStyle(PlanningPalette.ink)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .frame(minHeight: 44)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(14)
        .frame(width: 260)
    }

    private func icon(_ source: PeriodAddSource) -> String {
        switch source {
        case .plan: "list.bullet"
        case .create: "plus"
        case .postpone: "clock.arrow.circlepath"
        case .monthly, .periods: "calendar"
        }
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
                        PlanningTransition.perform {
                            if source == .create { onCreate() } else { picking = source }
                        }
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
            centerTitle: source.title,
            maximumBody: PlanningTokens.Sheet.maximumBody,
            bodySurface: Color.white
        ) {
            VStack(alignment: .leading, spacing: 12) {
                sourceBody
            }
            .padding(16)
        }
    }

    @ViewBuilder
    private var sourceBody: some View {
        switch source {
        case .plan:
            let plans = session.plans.filter(\.hasBeenSaved)
            ForEach(Array(plans.enumerated()), id: \.element.id) { index, plan in
                if index > 0 { Divider().overlay(PlanningPalette.line) }
                Text(plan.title.isEmpty ? "無題" : plan.title)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(PlanningPalette.ink)
                ForEach(plan.bullets) { bullet in
                    selectionRow(id: bullet.id, title: bullet.text.isEmpty ? "無題" : bullet.text, circular: false, indent: 0)
                    ForEach(bullet.children) { child in
                        selectionRow(id: child.id, title: child.text.isEmpty ? "無題" : child.text, circular: false, indent: 28)
                    }
                }
            }
        case .postpone:
            postponeSection(.monthly, title: "Monthly")
            postponeSection(.weekly, title: "Weekly")
            postponeSection(.daily, title: "Daily")
        case .monthly, .periods:
            let nodes = sourceNodes
            ForEach(Array(nodes.enumerated()), id: \.element.id) { index, node in
                selectionRow(id: node.id, title: node.title, circular: kind == .event, indent: 0)
                ForEach(node.children) { child in
                    selectionRow(id: child.id, title: child.title, circular: false, indent: 28)
                }
                if index < nodes.count - 1 {
                    Color.clear.frame(height: PlanningTokens.PeriodBody.timelineGap)
                }
            }
        case .create:
            EmptyView()
        }
    }

    private var sourceNodes: [PlanningNode] {
        if source == .monthly {
            return session.nodes(bucket: .monthly, periodKey: session.periodKey(for: .monthly), kind: kind)
        }
        return session.periodItems.filter { ($0.bucket == .monthly || $0.bucket == .weekly) && $0.kind == kind }
    }

    private func postponeSection(_ level: PlanningBucket, title: String) -> some View {
        let rows = session.postponed.filter { $0.kind == kind && $0.bucket == level }
        return VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.system(size: 16, weight: .bold)).foregroundStyle(PlanningPalette.ink)
            ForEach(rows) { row in
                selectionRow(id: row.id, title: row.title, circular: kind == .event, indent: 0)
            }
        }
    }

    private func selectionRow(id: UUID, title: String, circular: Bool, indent: CGFloat) -> some View {
        Button {
            toggle(id)
        } label: {
            HStack(spacing: 8) {
                Image(systemName: mark(id, circular: circular))
                    .foregroundStyle(selected.contains(id) ? PlanningPalette.accent : PlanningPalette.muted)
                Text(title).foregroundStyle(PlanningPalette.ink)
                Spacer(minLength: 0)
            }
            .padding(.leading, indent)
            .frame(minHeight: 44)
        }
        .buttonStyle(.plain)
    }

    private func mark(_ id: UUID, circular: Bool) -> String {
        if circular { return selected.contains(id) ? "checkmark.circle.fill" : "circle" }
        return selected.contains(id) ? "checkmark.square.fill" : "square"
    }

    private func toggle(_ id: UUID) {
        if source == .plan, let plan = session.plans.first(where: { $0.bullets.contains { $0.id == id || $0.children.contains { $0.id == id } } }) {
            selected = PlanningSelection.afterToggle(id: id, bullets: plan.bullets, selected: selected)
            return
        }
        if let parent = sourceNodes.first(where: { $0.id == id }) {
            if selected.contains(id) {
                selected.remove(id)
            } else {
                selected.insert(id)
                parent.children.forEach { selected.insert($0.id) }
            }
            return
        }
        if selected.contains(id) { selected.remove(id) } else { selected.insert(id) }
    }
}

private enum PlanningDateField: String, Identifiable {
    case start
    case end
    var id: String { rawValue }
    var title: String { self == .start ? "開始日時" : "終了日時" }
}

struct PlanningItemEditorSheet: View {
    @State var draft: PlanningItemDraft
    let isNew: Bool
    let bucket: PlanningBucket
    let kind: PlanningItemKind
    let periodKey: String
    let onSave: (PlanningItemDraft) -> Void
    let onClose: () -> Void
    @State private var original: PlanningItemDraft
    @State private var confirmDiscard = false
    @State private var editingDate: PlanningDateField?
    @State private var showingAllIcons = false
    @StateObject private var subtaskFocus = PlanningOutlineFocusCoordinator()

    init(draft: PlanningItemDraft, isNew: Bool, bucket: PlanningBucket, kind: PlanningItemKind, periodKey: String, onSave: @escaping (PlanningItemDraft) -> Void, onClose: @escaping () -> Void) {
        self.isNew = isNew
        self.bucket = bucket
        self.kind = kind
        self.periodKey = periodKey
        self.onSave = onSave
        self.onClose = onClose
        _draft = State(initialValue: draft)
        _original = State(initialValue: draft)
    }

    private var editorTitle: String {
        switch (kind, isNew) {
        case (.task, true): "タスクを追加"
        case (.task, false): "タスクを編集"
        case (.event, true): "予定を追加"
        case (.event, false): "予定を編集"
        }
    }

    var body: some View {
        PlanningSystemSheetChrome(
            onClose: requestClose,
            onConfirm: { onSave(draft) },
            centerTitle: editorTitle,
            maximumBody: PlanningTokens.Sheet.maximumBody,
            bodySurface: Color.white
        ) {
            VStack(alignment: .leading, spacing: 16) {
                formLabel("タイトル")
                TextField("タイトル", text: $draft.title)
                    .padding(.horizontal, 12)
                    .frame(height: 46)
                    .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(PlanningPalette.line, lineWidth: 1))
                formLabel("アイコン")
                iconRow
                formLabel("カラー")
                HStack(spacing: 11) {
                    ForEach(PlanIconColor.allCases) { choice in
                        Button { draft.colorID = choice.rawValue } label: {
                            Circle().fill(choice.color).frame(width: 30, height: 30)
                                .overlay(Circle().stroke(draft.colorID == choice.rawValue ? PlanningPalette.accent : Color.clear, lineWidth: 2).padding(-3))
                        }
                        .buttonStyle(.plain)
                    }
                }
                dateRow(.start)
                dateRow(.end)
                if kind == .task {
                    formLabel("サブタスク")
                    ForEach(draft.subtasks) { subtask in
                        subtaskField(subtask)
                    }
                }
            }
            .padding(16)
        }
        .sheet(item: $editingDate) { field in
            PlanningDateTimePopup(
                title: field.title,
                day: field == .start ? $draft.startDay : $draft.endDay,
                minutes: field == .start ? $draft.startMinutes : $draft.endMinutes,
                onClose: { editingDate = nil },
                onSave: { editingDate = nil }
            )
        }
        .sheet(isPresented: $showingAllIcons) {
            PlanningSystemSheetChrome(onClose: { showingAllIcons = false }, onConfirm: { showingAllIcons = false }, centerTitle: "アイコン", bodySurface: Color.white) {
                iconGrid(PlanningIconCatalog.symbols)
                    .padding(16)
            }
        }
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

    private func formLabel(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(PlanningPalette.muted)
            .padding(.bottom, -8)
    }

    private var iconRow: some View {
        HStack(spacing: 8) {
            iconGrid(Array(PlanningIconCatalog.symbols.prefix(6)))
            Button { showingAllIcons = true } label: {
                Text("…")
                    .frame(width: 38, height: 38)
                    .background(Color(uiColor: .secondarySystemBackground), in: Circle())
            }
            .buttonStyle(.plain)
        }
    }

    private func iconGrid(_ symbols: [String]) -> some View {
        HStack(spacing: 8) {
            ForEach(symbols, id: \.self) { symbol in
                Button { draft.iconSymbol = symbol } label: {
                    Image(systemName: symbol)
                        .foregroundStyle(PlanIconColor.resolved(draft.colorID).color)
                        .frame(width: 38, height: 38)
                        .background(draft.iconSymbol == symbol ? PlanningPalette.accent.opacity(0.16) : Color(uiColor: .secondarySystemBackground), in: Circle())
                        .overlay(Circle().stroke(draft.iconSymbol == symbol ? PlanningPalette.accent : Color.clear, lineWidth: 1.5))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func dateRow(_ field: PlanningDateField) -> some View {
        let day = field == .start ? draft.startDay : draft.endDay
        let minutes = field == .start ? draft.startMinutes : draft.endMinutes
        let value = PlanningRangeText.display(startDay: day, endDay: nil, startMinutes: minutes, endMinutes: nil)
        return Button {
            PlanningTransition.perform { editingDate = field }
        } label: {
            HStack {
                Image(systemName: "calendar")
                    .foregroundStyle(PlanningPalette.accent)
                Text(field.title).foregroundStyle(PlanningPalette.ink)
                Spacer()
                Text(value.isEmpty ? "未設定" : value).foregroundStyle(PlanningPalette.muted)
                Image(systemName: "chevron.right").foregroundStyle(PlanningPalette.muted)
            }
            .padding(.horizontal, 12)
            .frame(height: 46)
            .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func subtaskField(_ subtask: PlanningSubtaskDraft) -> some View {
        PlanningOutlineTextField(
            rowID: subtask.id,
            text: subtaskBinding(subtask.id),
            focus: subtaskFocus,
            placeholder: "サブタスク",
            fontSize: 16,
            onFocus: {},
            onSubmit: { submitSubtask(subtask.id) },
            onEmptyDelete: { deleteEmptySubtask(subtask.id) }
        )
        .frame(height: 36)
    }

    private func subtaskBinding(_ id: UUID) -> Binding<String> {
        Binding(
            get: { draft.subtasks.first { $0.id == id }?.title ?? "" },
            set: { value in
                if let index = draft.subtasks.firstIndex(where: { $0.id == id }) {
                    draft.subtasks[index].title = value
                }
            }
        )
    }

    private func submitSubtask(_ id: UUID) {
        guard let index = draft.subtasks.firstIndex(where: { $0.id == id }) else { return }
        let title = draft.subtasks[index].title
        if PlanningRowEntry.shouldAppendNextRow(title) {
            let next = PlanningSubtaskDraft()
            draft.subtasks.append(next)
            subtaskFocus.requestFocus(next.id)
        } else {
            UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        }
    }

    private func deleteEmptySubtask(_ id: UUID) {
        guard let index = draft.subtasks.firstIndex(where: { $0.id == id }), index > 0 else { return }
        let previous = draft.subtasks[index - 1].id
        subtaskFocus.requestFocus(previous)
        draft.subtasks.removeAll { $0.id == id }
    }

    private func requestClose() {
        if draft != original { confirmDiscard = true } else { onClose() }
    }
}

struct PlanningDateTimePopup: View {
    let title: String
    @Binding var day: Int?
    @Binding var minutes: Int?
    let onClose: () -> Void
    let onSave: () -> Void
    @State private var date = Date()
    @State private var timeEnabled = false

    var body: some View {
        PlanningSystemSheetChrome(onClose: onClose, onConfirm: commit, centerTitle: title, bodySurface: Color.white) {
            VStack(alignment: .leading, spacing: 12) {
                DatePicker("日付", selection: $date, displayedComponents: .date)
                    .datePickerStyle(.graphical)
                Toggle(title == "開始日時" ? "開始時刻" : "終了時刻", isOn: $timeEnabled)
                if timeEnabled {
                    DatePicker("時刻", selection: $date, displayedComponents: .hourAndMinute)
                }
                Text(PlanningRangeText.display(startDay: day, endDay: nil, startMinutes: minutes, endMinutes: nil))
                    .font(.caption)
                    .foregroundStyle(PlanningPalette.muted)
            }
            .padding(16)
        }
        .onAppear {
            timeEnabled = minutes != nil
            var components = Calendar.current.dateComponents([.year, .month], from: Date())
            components.day = day ?? Calendar.current.component(.day, from: Date())
            if let minutes {
                components.hour = minutes / 60
                components.minute = minutes % 60
            }
            date = Calendar.current.date(from: components) ?? Date()
        }
    }

    private func commit() {
        let calendar = Calendar.current
        day = calendar.component(.day, from: date)
        if timeEnabled {
            minutes = calendar.component(.hour, from: date) * 60 + calendar.component(.minute, from: date)
        } else {
            minutes = nil
        }
        onSave()
    }
}
