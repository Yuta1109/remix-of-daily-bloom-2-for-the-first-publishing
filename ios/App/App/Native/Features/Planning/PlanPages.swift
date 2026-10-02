import SwiftUI

struct PlanListPage: View {
    @ObservedObject var session: PlanningSession
    @EnvironmentObject private var navigation: TabNavigationState

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .top, spacing: 10) {
                    PlanningHeadingIconSlot()
                    VStack(alignment: .leading, spacing: 6) {
                        Text("今、考えていることを整理しよう")
                            .font(.headline)
                            .foregroundStyle(PlanningPalette.ink)
                        Text("まずは今考えていることを箇条書きで書いてみましょう。そうしている内にやるべきことがわかってきます。")
                            .font(.subheadline)
                            .foregroundStyle(PlanningPalette.muted)
                    }
                }
                Button {
                    let id = session.beginPlan()
                    navigation.path.append(PlanningRoute.planEditor(id))
                } label: {
                    Text("+  プランを新規作成")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(PlanningPalette.ink)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(PlanningPalette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(PlanningPalette.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
                VStack(alignment: .leading, spacing: 10) {
                    Text("プランの一覧")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(PlanningPalette.ink)
                    if session.plans.filter(\.hasBeenSaved).isEmpty {
                        Text("まだプランはありません")
                            .font(.subheadline)
                            .foregroundStyle(PlanningPalette.muted)
                    }
                }
                ForEach(session.plans.filter(\.hasBeenSaved)) { plan in
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(plan.title.isEmpty ? "無題のプラン" : plan.title)
                                .font(.body.weight(.semibold))
                            Text("リプラン数 \(plan.replanCount)")
                                .font(.caption)
                            Text("最終更新日 \(Self.dateText(plan.updatedAt))")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Menu {
                            Button("編集") {
                                navigation.path.append(PlanningRoute.planEditor(plan.id))
                            }
                        } label: {
                            Image(systemName: "ellipsis")
                                .frame(width: 44, height: 44)
                        }
                    }
                    .padding(14)
                    .background(PlanningPalette.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(PlanningPalette.line, lineWidth: 1))
                }
            }
            .padding(16)
        }
        .planningScroll()
        .planningKeyboardDismiss()
        .background(PlanningPalette.paper)
    }

    private static func dateText(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "ja_JP")
        formatter.dateFormat = "yyyy/MM/dd"
        return formatter.string(from: date)
    }
}

struct PlanEditorPage: View {
    @ObservedObject var session: PlanningSession
    @EnvironmentObject private var navigation: TabNavigationState
    let planID: UUID

    @State private var title = ""
    @State private var bullets: [PlanBullet] = [PlanBullet()]
    @State private var memo = ""
    @State private var savedSnapshot = ""
    @State private var confirmDiscard = false
    @State private var showingCopy = false
    @FocusState private var focusedID: UUID?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                NativeGlassIconButton(icon: .back, accessibilityLabel: "Back") { requestClose() }
                TextField("タイトル", text: $title)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(PlanningPalette.ink)
                Spacer()
                NativeGlassIconButton(icon: .check, accessibilityLabel: "Save", prominent: true, action: save)
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach($bullets) { $bullet in
                        TextField("項目", text: $bullet.text)
                            .focused($focusedID, equals: bullet.id)
                            .onSubmit { appendParent(after: bullet) }
                        ForEach($bullet.children) { $child in
                            TextField("サブタスク", text: $child.text)
                                .padding(.leading, 18)
                                .focused($focusedID, equals: child.id)
                                .onSubmit { appendChild(of: bullet.id, after: child) }
                        }
                    }
                    Text("メモ")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(PlanningPalette.muted)
                        .padding(.top, 12)
                    TextEditor(text: $memo)
                        .frame(minHeight: 120)
                        .scrollContentBackground(.hidden)
                        .padding(8)
                        .background(PlanningPalette.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(PlanningPalette.line, lineWidth: 1))
                }
                .padding(16)
            }
            .planningScroll()
            Button("タスク・予定に反映") { showingCopy = true }
                .buttonStyle(.borderedProminent)
                .padding(16)
        }
        .planningKeyboardDismiss()
        .background(PlanningPalette.paper)
        .navigationBarHidden(true)
        .onAppear(perform: load)
        .sheet(isPresented: $showingCopy) {
            PlanCopySheet(session: session, planID: planID, bullets: bullets, onCopied: save)
        }
        .confirmationDialog("この変更を破棄しますか？", isPresented: $confirmDiscard, titleVisibility: .visible) {
            Button("破棄", role: .destructive) { navigation.pop() }
            Button("キャンセル", role: .cancel) {}
        }
    }

    private func load() {
        guard let plan = session.plans.first(where: { $0.id == planID }) else { return }
        title = plan.title
        bullets = clamped(plan.bullets)
        memo = plan.memo
        savedSnapshot = snapshot()
    }

    private func save() {
        bullets = clamped(bullets)
        session.save(planID: planID, title: title, bullets: bullets, memo: memo)
        savedSnapshot = snapshot()
    }

    private func requestClose() {
        if snapshot() != savedSnapshot { confirmDiscard = true } else { navigation.pop() }
    }

    private func snapshot() -> String {
        title + "\n" + memo + "\n" + bullets.map { "\($0.id)\($0.text)" + $0.children.map { "\($0.id)\($0.text)" }.joined() }.joined()
    }

    private func clamped(_ nodes: [PlanBullet]) -> [PlanBullet] {
        nodes.map { PlanBullet(id: $0.id, text: $0.text, children: $0.children.map { PlanBullet(id: $0.id, text: $0.text) }) }
    }

    private func appendParent(after bullet: PlanBullet) {
        guard PlanningRowEntry.shouldAppendNextRow(bullet.text), let index = bullets.firstIndex(where: { $0.id == bullet.id }) else { return }
        let next = PlanBullet()
        if bullets[index].children.isEmpty {
            bullets[index].children.append(next)
        } else {
            bullets.append(next)
        }
        focusedID = next.id
    }

    private func appendChild(of parentID: UUID, after child: PlanBullet) {
        guard PlanningRowEntry.shouldAppendNextRow(child.text), let index = bullets.firstIndex(where: { $0.id == parentID }) else { return }
        let next = PlanBullet()
        bullets[index].children.append(next)
        focusedID = next.id
    }
}

private struct PlanCopySheet: View {
    @ObservedObject var session: PlanningSession
    let planID: UUID
    let bullets: [PlanBullet]
    let onCopied: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var selected: Set<UUID> = []
    @State private var showingDestination = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(PlanningRules.transferExplanation)
                .font(.footnote)
                .foregroundStyle(PlanningPalette.muted)
            Button("全体を選択") {
                selected = Set(bullets.flatMap { [$0.id] + $0.children.map(\.id) })
            }
            .buttonStyle(.bordered)
            ForEach(bullets) { bullet in
                Toggle(bullet.text.isEmpty ? "無題" : bullet.text, isOn: parentBinding(bullet))
                ForEach(bullet.children) { child in
                    Toggle(child.text.isEmpty ? "無題" : child.text, isOn: childBinding(child.id))
                        .padding(.leading, 18)
                }
            }
            Button("コピー先を選ぶ") { showingDestination = true }
                .buttonStyle(.borderedProminent)
                .disabled(selected.isEmpty)
        }
        .padding(16)
        .background(PlanningPalette.paper)
        .presentationDetents([.medium])
        .presentationDragIndicator(.hidden)
        .sheet(isPresented: $showingDestination) {
            PlanDestinationSheet(session: session, planID: planID, selected: selected) {
                onCopied()
                dismiss()
            }
        }
    }

    private func parentBinding(_ bullet: PlanBullet) -> Binding<Bool> {
        Binding(
            get: { selected.contains(bullet.id) },
            set: { _ in selected = PlanningSelection.afterToggle(id: bullet.id, bullets: bullets, selected: selected) }
        )
    }

    private func childBinding(_ id: UUID) -> Binding<Bool> {
        Binding(
            get: { selected.contains(id) },
            set: { _ in selected = PlanningSelection.afterToggle(id: id, bullets: bullets, selected: selected) }
        )
    }
}

private struct PlanDestinationSheet: View {
    @ObservedObject var session: PlanningSession
    let planID: UUID
    let selected: Set<UUID>
    let onDone: () -> Void
    @State private var kind: PlanningItemKind = .task
    @State private var bucket: PlanningBucket = .monthly
    @State private var date = Date()

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        PlanningSheetChrome(onClose: { dismiss() }, onConfirm: copy, fixedHeight: 360) {
            VStack {
                Picker("種類", selection: $kind) {
                    Text("タスク").tag(PlanningItemKind.task)
                    Text("予定").tag(PlanningItemKind.event)
                }
                .pickerStyle(.segmented)
                Picker("期間", selection: $bucket) {
                    Text("Monthly").tag(PlanningBucket.monthly)
                    Text("Weekly").tag(PlanningBucket.weekly)
                    Text("Daily").tag(PlanningBucket.daily)
                }
                .pickerStyle(.segmented)
                if bucket == .monthly {
                    DatePicker("月", selection: $date, displayedComponents: .date)
                        .datePickerStyle(.compact)
                } else {
                    DatePicker(bucket == .weekly ? "週" : "日", selection: $date, displayedComponents: .date)
                        .datePickerStyle(.compact)
                }
            }
            .padding(.horizontal, 16)
        }
    }

    private func copy() {
        let key: String
        switch bucket {
        case .monthly:
            let parts = PeriodCalendar.calendar.dateComponents([.year, .month], from: date)
            key = PeriodCalendar.monthKey(year: parts.year ?? 2026, month: parts.month ?? 1)
        case .weekly:
            key = PeriodCalendar.weekKey(containing: date)
        case .daily:
            key = PeriodCalendar.dayKey(date)
        }
        session.assignPeriod(key, bucket: bucket)
        let target = PlanTransferTarget.allCases.first { $0.bucket == bucket && $0.kind == kind } ?? .monthlyTask
        let before = session.plans.first { $0.id == planID }?.bullets ?? []
        session.transfer(planID: planID, bulletIDs: selected, includeChildren: false, to: target)
        if let index = session.plans.firstIndex(where: { $0.id == planID }) {
            session.plans[index].bullets = before
        }
        onDone()
    }
}
