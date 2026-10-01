import SwiftUI
import PhotosUI

struct ReflectionFlowPage: View {
    @ObservedObject var session: PlanningSession
    @EnvironmentObject private var navigation: TabNavigationState
    let scope: ReflectionScope

    @State private var showConfirm = false

    var body: some View {
        let draft = session.reflectionDraft
        let started = draft?.scope == scope && draft?.started == true
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                NativeGlassIconButton(icon: .back, accessibilityLabel: "Back") {
                    if !navigation.path.isEmpty { navigation.pop() }
                }
                Text(started ? "振り返りをしましょう！" : "振り返りを始めますか？")
                    .font(.title2.bold())
                if started {
                    summary
                    explanations
                    ForEach(session.reflectionItems(scope)) { item in
                        decisionRow(item)
                    }
                    Button("振り返りを終える") {
                        if session.completeReflection(scope: scope), !navigation.path.isEmpty {
                            navigation.pop()
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(!session.canCompleteReflection(scope))
                }
                Button("振り返りの設定") {
                    navigation.path.append(PlanningRoute.reflectionSettings)
                }
                .buttonStyle(.bordered)
            }
            .padding(16)
        }
        .planningScroll()
        .planningKeyboardDismiss()
        .background(PlanningPalette.paper)
        .navigationBarHidden(true)
        .confirmationDialog("振り返りを始めますか？", isPresented: $showConfirm, titleVisibility: .visible) {
            Button("始める") { session.beginReflection(scope) }
            Button(skipTitle) { 
                session.skipReflection(scope)
                if !navigation.path.isEmpty { navigation.pop() }
            }
            Button("キャンセル", role: .cancel) {
                if !navigation.path.isEmpty { navigation.pop() }
            }
        }
        .onAppear {
            if !(session.reflectionDraft?.scope == scope && session.reflectionDraft?.started == true) {
                showConfirm = true
            }
        }
    }

    private var skipTitle: String {
        switch scope {
        case .period(.daily, _): "今日はやめとく"
        case .period(.weekly, _): "今週はやめとく"
        case .period(.monthly, _): "今月はやめとく"
        case .future: "今年はやめとく"
        }
    }

    private var summary: some View {
        let fraction = session.achievementFraction(for: scope)
        return VStack(alignment: .leading, spacing: 6) {
            Text("この期間の記録")
                .font(.headline)
            Text("タスクの達成 \(Int((fraction * 100).rounded()))%")
                .font(.subheadline)
            Text("予定 \(session.reflectionItems(scope).filter { $0.kind == .event }.count) 件")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }

    private var explanations: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("維持: 次の期間でも続けるもの")
            Text("先送り: 次にいつ扱うかまだ決めず、先送りボックスへ置くもの")
            Text("終了: 今後の計画から外すもの")
        }
        .font(.caption)
        .foregroundStyle(.secondary)
    }

    private func decisionRow(_ item: ReflectionItem) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(item.title.isEmpty ? "無題" : item.title)
                .font(.body.weight(.semibold))
            Text(item.completed ? "完了" : "未完了")
                .font(.caption)
            Picker("分類", selection: Binding(
                get: { session.reflectionDraft?.decisions[item.id] ?? itemFallback },
                set: { session.setDraftDecision(itemID: item.id, disposition: $0) }
            )) {
                Text("維持").tag(ReflectionDisposition.keep)
                Text("先送り").tag(ReflectionDisposition.postpone)
                Text("終了").tag(ReflectionDisposition.stop)
            }
            .pickerStyle(.segmented)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var itemFallback: ReflectionDisposition { .stop }
}

struct ReflectionResultView: View {
    @ObservedObject var session: PlanningSession
    @EnvironmentObject private var navigation: TabNavigationState
    let scope: ReflectionScope

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("振り返り結果")
                .font(.title3.weight(.semibold))
            Text("達成 \(Int((session.achievementFraction(for: scope) * 100).rounded()))%")
                .font(.subheadline)
            Text("完了状態と、維持・先送り・終了は別々です。")
                .font(.footnote)
                .foregroundStyle(.secondary)
            ForEach(session.decisions(for: scope)) { decision in
                VStack(alignment: .leading, spacing: 2) {
                    Text(decision.title)
                    Text(decision.completed ? "完了" : "未完了")
                        .font(.caption)
                    Text(label(decision.disposition))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Button("Replan") {
                session.select(.plan)
            }
            .buttonStyle(.borderedProminent)
            Button("振り返り履歴") {
                navigation.path.append(PlanningRoute.reflectionHistory)
            }
            .buttonStyle(.bordered)
            if case .period(let bucket, let key) = scope {
                Button("この期間を編集") {
                    session.setExplicitEdit(bucket: bucket, periodKey: key, enabled: true)
                }
                .buttonStyle(.bordered)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func label(_ value: ReflectionDisposition) -> String {
        switch value {
        case .keep: "維持"
        case .postpone: "先送り"
        case .stop: "終了"
        }
    }
}

struct ReflectionHistoryPage: View {
    @ObservedObject var session: PlanningSession
    @EnvironmentObject private var navigation: TabNavigationState
    @State private var section: PlanningSection = .monthly

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            NativeGlassIconButton(icon: .back, accessibilityLabel: "Back") {
                if !navigation.path.isEmpty { navigation.pop() }
            }
            Text("振り返り履歴")
                .font(.title2.bold())
            Picker("種類", selection: $section) {
                Text("Future").tag(PlanningSection.future)
                Text("Monthly").tag(PlanningSection.monthly)
                Text("Weekly").tag(PlanningSection.weekly)
                Text("Daily").tag(PlanningSection.daily)
            }
            .pickerStyle(.segmented)
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(session.completedHistory(for: section), id: \.self) { scope in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(historyTitle(scope))
                                .font(.headline)
                            ForEach(session.decisions(for: scope)) { decision in
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(decision.title)
                                    Text(decision.completed ? "完了" : "未完了")
                                        .font(.caption)
                                    Picker("分類", selection: Binding(
                                        get: { decision.disposition },
                                        set: { session.updateHistoricalDecision(scope: scope, itemID: decision.itemID, disposition: $0) }
                                    )) {
                                        Text("維持").tag(ReflectionDisposition.keep)
                                        Text("先送り").tag(ReflectionDisposition.postpone)
                                        Text("終了").tag(ReflectionDisposition.stop)
                                    }
                                    .pickerStyle(.segmented)
                                }
                            }
                        }
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                }
            }
        }
        .padding(16)
        .planningScroll()
        .planningKeyboardDismiss()
        .background(PlanningPalette.paper)
        .navigationBarHidden(true)
    }

    private func historyTitle(_ scope: ReflectionScope) -> String {
        switch scope {
        case .period(let bucket, let key):
            PeriodCalendar.label(bucket: bucket, key: key)
        case .future(let year):
            "\(year)年"
        }
    }
}

struct ReflectionSettingsPage: View {
    @ObservedObject var session: PlanningSession
    @EnvironmentObject private var navigation: TabNavigationState

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                NativeGlassIconButton(icon: .back, accessibilityLabel: "Back") {
                    if !navigation.path.isEmpty { navigation.pop() }
                }
                Text("Reflection Settings")
                    .font(.title2.bold())
                Stepper("Daily \(session.reflectionSchedule.dailyHour):00", value: $session.reflectionSchedule.dailyHour, in: 0...23)
                Toggle("翌日の開始にする", isOn: $session.reflectionSchedule.dailyUsesNextDay)
                Stepper("Weekly weekday \(session.reflectionSchedule.weeklyWeekday)", value: $session.reflectionSchedule.weeklyWeekday, in: 1...7)
                Toggle("月の初めに振り返る", isOn: $session.reflectionSchedule.monthlyUsesStart)
                Text("Future は \(session.reflectionSchedule.futureMonth)月\(session.reflectionSchedule.futureDay)日")
                    .foregroundStyle(.secondary)
            }
            .padding(16)
        }
        .planningScroll()
        .planningKeyboardDismiss()
        .background(PlanningPalette.paper)
        .navigationBarHidden(true)
    }
}

struct NoActivityMemorySection: View {
    @ObservedObject var session: PlanningSession
    let scope: ReflectionScope
    @State private var photo: PhotosPickerItem?

    private var entry: PlanningMemoryEntry? {
        session.memoryEntries.first { $0.scope == scope }
    }

    var body: some View {
        if let entry {
            if entry.kind == .photoNote {
                photoLayout(entry)
            } else {
                diaryLayout(entry)
            }
        } else {
            recommendation
        }
    }

    private var recommendation: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("忙しい日はだれにでもあります。\n今日は下のどちらかをやってみませんか？")
                .font(.body)
                .foregroundStyle(PlanningPalette.ink)
            choiceButton(
                title: "写真 & 一言",
                detail: "写真を1枚と、短い一言だけ残します。",
                kind: .photoNote
            )
            choiceButton(
                title: "なんでも日記",
                detail: "タイトルと日にち、本文だけを書きます。",
                kind: .diary
            )
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PlanningPalette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(PlanningPalette.line, lineWidth: 1))
    }

    private func choiceButton(title: String, detail: String, kind: PlanningMemoryKind) -> some View {
        Button {
            session.addMemory(scope: scope, kind: kind, text: "", hasPhoto: false)
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.headline).foregroundStyle(PlanningPalette.ink)
                Text(detail).font(.subheadline).foregroundStyle(PlanningPalette.muted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(PlanningPalette.paper, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func photoLayout(_ entry: PlanningMemoryEntry) -> some View {
        VStack(spacing: 16) {
            PhotosPicker(selection: $photo, matching: .images) {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(PlanningPalette.card)
                    .frame(maxWidth: .infinity)
                    .frame(height: 280)
                    .overlay {
                        Text(entry.hasPhoto ? "写真" : "写真を選ぶ")
                            .foregroundStyle(PlanningPalette.muted)
                    }
                    .overlay(RoundedRectangle(cornerRadius: 18).stroke(PlanningPalette.line, lineWidth: 1))
            }
            TextField("一言", text: memoryText(entry))
                .textFieldStyle(.roundedBorder)
        }
        .frame(maxWidth: .infinity, minHeight: 420)
        .onChange(of: photo) { _, item in
            session.updateMemory(id: entry.id, text: entry.text, title: entry.title, dateText: entry.dateText, hasPhoto: item != nil)
        }
    }

    private func diaryLayout(_ entry: PlanningMemoryEntry) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            TextField("タイトル", text: memoryTitle(entry))
                .font(.title3.weight(.semibold))
            TextField("日にち", text: memoryDate(entry))
            TextField("本文", text: memoryText(entry), axis: .vertical)
                .lineLimit(8...16)
        }
        .padding(16)
        .frame(maxWidth: .infinity, minHeight: 420, alignment: .topLeading)
        .background(PlanningPalette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(PlanningPalette.line, lineWidth: 1))
    }

    private func memoryText(_ entry: PlanningMemoryEntry) -> Binding<String> {
        Binding(
            get: { entry.text },
            set: { session.updateMemory(id: entry.id, text: $0, title: entry.title, dateText: entry.dateText, hasPhoto: entry.hasPhoto) }
        )
    }

    private func memoryTitle(_ entry: PlanningMemoryEntry) -> Binding<String> {
        Binding(
            get: { entry.title },
            set: { session.updateMemory(id: entry.id, text: entry.text, title: $0, dateText: entry.dateText, hasPhoto: entry.hasPhoto) }
        )
    }

    private func memoryDate(_ entry: PlanningMemoryEntry) -> Binding<String> {
        Binding(
            get: { entry.dateText },
            set: { session.updateMemory(id: entry.id, text: entry.text, title: entry.title, dateText: $0, hasPhoto: entry.hasPhoto) }
        )
    }
}
