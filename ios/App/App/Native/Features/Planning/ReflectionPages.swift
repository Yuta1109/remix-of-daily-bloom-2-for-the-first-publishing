import SwiftUI
import PhotosUI

struct ReflectionFlowPage: View {
    @ObservedObject var session: PlanningSession
    @EnvironmentObject private var navigation: TabNavigationState
    let scope: ReflectionScope

    private var completed: Bool {
        switch scope {
        case .period(let bucket, let key):
            session.isReflectionComplete(bucket: bucket, periodKey: key)
        case .future(let year):
            session.futureReflections.first { $0.year == year }?.reflectionCompleted == true
        }
    }

    var body: some View {
        Group {
            if completed {
                resultPage
            } else {
                classificationPage
            }
        }
        .background(PlanningPalette.paper)
        .planningPageChrome(title: PlanningText.string(completed ? .reflectionResult : .reflectionTitle), onBack: {
            if !navigation.path.isEmpty { navigation.pop() }
        })
        .onAppear {
            if !completed { session.beginReflection(scope) }
        }
    }

    private var classificationPage: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(periodContext)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(PlanningPalette.muted)
                Text(PlanningText.string(.reflectionExplain))
                    .font(.body)
                    .foregroundStyle(PlanningPalette.ink)
                ForEach(session.reflectionItems(scope)) { item in
                    decisionRow(item)
                }
            }
            .padding(16)
            .padding(.bottom, 12)
        }
        .planningScroll()
        .safeAreaInset(edge: .bottom, spacing: 0) {
            PlanningGlassAction(title: PlanningText.string(.confirmReflection)) {
                if session.completeReflection(scope: scope), !navigation.path.isEmpty {
                    navigation.pop()
                }
            }
            .disabled(!session.canCompleteReflection(scope))
        }
    }

    private var resultPage: some View {
        let counts = session.classificationCounts(for: scope)
        let completion = session.snapshotCompletion(for: scope)
        return ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text(periodContext)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(PlanningPalette.accent)
                Text("ToDo \(completion.todoDone) / \(completion.todoTotal) 完了")
                Text("予定 \(completion.eventDone) / \(completion.eventTotal)")
                Text("\(PlanningText.string(.keepCount)) \(counts.keep)件")
                Text("\(PlanningText.string(.postponeCount)) \(counts.postpone)件")
                Text("\(PlanningText.string(.stopCount)) \(counts.stop)件")
                Text("完了状態と、維持・先送り・終了は別々です。")
                    .font(.footnote)
                    .foregroundStyle(PlanningPalette.muted)
                Button("Replan") { session.select(.plan) }
                    .buttonStyle(.bordered)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .planningScroll()
    }

    private var periodContext: String {
        switch scope {
        case .period(let bucket, let key):
            PeriodCalendar.label(bucket: bucket, key: key)
        case .future(let year):
            "\(year)"
        }
    }

    private func decisionRow(_ item: ReflectionItem) -> some View {
        let selected = session.reflectionDraft?.decisions[item.id]
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: item.kind == .event ? "calendar" : "checkmark.circle")
                    .foregroundStyle(PlanningPalette.muted)
                Text(item.title.isEmpty ? "無題" : item.title)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(PlanningPalette.ink)
            }
            HStack(spacing: 0) {
                choice(.keep, selected: selected, item: item)
                choice(.postpone, selected: selected, item: item)
                choice(.stop, selected: selected, item: item)
            }
            .background(Color(uiColor: .secondarySystemFill), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .padding(.vertical, 4)
    }

    private func choice(_ value: ReflectionDisposition, selected: ReflectionDisposition?, item: ReflectionItem) -> some View {
        let on = selected == value
        return Button {
            session.setDraftDecision(itemID: item.id, disposition: value)
        } label: {
            Text(label(value))
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(on ? Color.white : PlanningPalette.ink)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .background(on ? PlanningPalette.accent : Color.clear)
        }
        .buttonStyle(.plain)
    }

    private func label(_ value: ReflectionDisposition) -> String {
        switch value {
        case .keep: "維持"
        case .postpone: "先送り"
        case .stop: "終了"
        }
    }
}

struct PlanningReflectionDueCard: View {
    let bucket: PlanningBucket
    let action: () -> Void
    var tabBarHeight: CGFloat

    private var accent: Color { PlanningPalette.accent }

    var body: some View {
        let card = VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(PlanningPalette.ink)
            Text(explanation)
                .font(.system(size: 12))
                .foregroundStyle(PlanningPalette.ink)
                .lineLimit(2)
            Button(PlanningText.string(.startReflection), action: action)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(accent)
                .buttonStyle(.plain)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .frame(height: PlanningTokens.ReflectionDue.height(tabBar: tabBarHeight))

        if #available(iOS 26.0, *) {
            card.glassEffect(.regular.interactive(), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        } else {
            card.background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
    }

    private var title: String {
        switch bucket {
        case .monthly: PlanningText.string(.monthlyDueTitle)
        case .weekly: PlanningText.string(.weeklyDueTitle)
        case .daily: PlanningText.string(.dailyDueTitle)
        }
    }

    private var explanation: String {
        switch bucket {
        case .monthly: PlanningText.string(.monthlyDueBody)
        case .weekly: PlanningText.string(.weeklyDueBody)
        case .daily: PlanningText.string(.dailyDueBody)
        }
    }
}

struct ReflectionResultView: View {
    @ObservedObject var session: PlanningSession
    @EnvironmentObject private var navigation: TabNavigationState
    let scope: ReflectionScope

    var body: some View {
        let counts = session.classificationCounts(for: scope)
        let completion = session.snapshotCompletion(for: scope)
        let title = session.reflectionIsSample(scope) ? "振り返り結果（例）" : PlanningText.string(.reflectionResult)
        return VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(PlanningPalette.ink)
            Text("ToDo \(completion.todoDone) / \(completion.todoTotal) 完了")
                .font(.subheadline)
            Text("予定 \(completion.eventDone) / \(completion.eventTotal)")
                .font(.subheadline)
            Text("\(PlanningText.string(.keepCount)) \(counts.keep)件")
            Text("\(PlanningText.string(.postponeCount)) \(counts.postpone)件")
            Text("\(PlanningText.string(.stopCount)) \(counts.stop)件")
            Button("結果を開く") {
                navigation.path.append(PlanningRoute.reflection(scope))
            }
            .buttonStyle(.bordered)
            Button("Replan") { session.select(.plan) }
                .buttonStyle(.bordered)
            Button("振り返り履歴") {
                navigation.path.append(PlanningRoute.reflectionHistory)
            }
            .buttonStyle(.bordered)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(PlanningPalette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(PlanningPalette.line, lineWidth: 1))
    }
}

struct ReflectionHistoryPage: View {
    @ObservedObject var session: PlanningSession
    @EnvironmentObject private var navigation: TabNavigationState
    @State private var section: PlanningSection = .monthly

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
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
                        historyCard(scope)
                    }
                }
            }
        }
        .padding(16)
        .planningScroll()
        .background(PlanningPalette.paper)
        .planningPageChrome(title: "振り返り履歴", onBack: {
            if !navigation.path.isEmpty { navigation.pop() }
        })
    }

    private func historyCard(_ scope: ReflectionScope) -> some View {
        let counts = session.classificationCounts(for: scope)
        return Button {
            navigation.path.append(PlanningRoute.reflectionEdit(scope))
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                Text(historyTitle(scope))
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(PlanningPalette.ink)
                Text("維持 \(counts.keep)件  先送り \(counts.postpone)件  終了 \(counts.stop)件")
                    .font(.system(size: 13))
                    .foregroundStyle(PlanningPalette.muted)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(PlanningPalette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
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

struct ReflectionEditPage: View {
    @ObservedObject var session: PlanningSession
    @EnvironmentObject private var navigation: TabNavigationState
    let scope: ReflectionScope

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text(periodContext)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(PlanningPalette.accent)
                ForEach(session.decisions(for: scope)) { decision in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(decision.title)
                            .font(.body.weight(.semibold))
                            .foregroundStyle(PlanningPalette.ink)
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
            .padding(16)
        }
        .planningScroll()
        .background(PlanningPalette.paper)
        .planningPageChrome(title: "振り返りを編集", onBack: {
            if !navigation.path.isEmpty { navigation.pop() }
        })
    }

    private var periodContext: String {
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
        .background(PlanningPalette.paper)
        .planningPageChrome(title: "Reflection Settings", onBack: {
            if !navigation.path.isEmpty { navigation.pop() }
        })
    }
}

struct NoActivityMemorySection: View {
    @ObservedObject var session: PlanningSession
    @EnvironmentObject private var navigation: TabNavigationState
    let scope: ReflectionScope

    private var entry: PlanningMemoryEntry? {
        session.memoryEntries.first { $0.scope == scope }
    }

    var body: some View {
        if let entry, entry.saved {
            Button {
                navigation.path.append(PlanningRoute.planningMemory(scope))
            } label: {
                VStack(alignment: .leading, spacing: 4) {
                    Text(entry.kind == .photoNote ? PlanningText.string(.photoAndLine) : PlanningText.string(.anythingDiary))
                        .font(.headline)
                        .foregroundStyle(PlanningPalette.ink)
                    Text(entry.kind == .photoNote ? entry.text : entry.title)
                        .font(.subheadline)
                        .foregroundStyle(PlanningPalette.muted)
                        .lineLimit(2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(14)
                .background(PlanningPalette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            .buttonStyle(.plain)
        } else {
            recommendation
        }
    }

    private var recommendation: some View {
        VStack(spacing: 16) {
            Image(systemName: "leaf")
                .font(.system(size: 28, weight: .regular))
                .foregroundStyle(PlanningPalette.accent)
                .frame(width: 64, height: 64)
                .background(PlanningPalette.accent.opacity(0.12), in: Circle())
            Text(emptyTitle)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(PlanningPalette.ink)
                .multilineTextAlignment(.center)
            Text(emptyBody)
                .font(.system(size: 15))
                .foregroundStyle(PlanningPalette.muted)
                .multilineTextAlignment(.center)
            choiceButton(title: PlanningText.string(.photoAndLine), kind: .photoNote)
            choiceButton(title: PlanningText.string(.anythingDiary), kind: .diary)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .center)
    }

    private var emptyTitle: String {
        switch scope {
        case .period(.monthly, _): PlanningText.string(.monthlyEmptyTitle)
        case .period(.weekly, _): PlanningText.string(.weeklyEmptyTitle)
        case .period(.daily, _), .future: PlanningText.string(.dailyEmptyTitle)
        }
    }

    private var emptyBody: String {
        switch scope {
        case .period(.monthly, _): PlanningText.string(.monthlyEmptyBody)
        case .period(.weekly, _): PlanningText.string(.weeklyEmptyBody)
        case .period(.daily, _), .future: PlanningText.string(.dailyEmptyBody)
        }
    }

    private func choiceButton(title: String, kind: PlanningMemoryKind) -> some View {
        Button {
            if entry == nil {
                session.addMemory(scope: scope, kind: kind, text: "", hasPhoto: false)
            }
            navigation.path.append(PlanningRoute.planningMemory(scope))
        } label: {
            Text(title)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(PlanningPalette.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
                .background(PlanningPalette.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(PlanningPalette.accent.opacity(0.45), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

struct PlanningMemoryPage: View {
    @ObservedObject var session: PlanningSession
    @EnvironmentObject private var navigation: TabNavigationState
    let scope: ReflectionScope
    @State private var photo: PhotosPickerItem?

    private var entry: PlanningMemoryEntry? {
        session.memoryEntries.first { $0.scope == scope }
    }

    var body: some View {
        ScrollView {
            if let entry {
                if entry.saved {
                    completed(entry)
                } else if entry.kind == .photoNote {
                    photoEditor(entry)
                } else {
                    diaryEditor(entry)
                }
            }
        }
        .planningScroll()
        .planningKeyboardDismiss()
        .background(PlanningPalette.paper)
        .planningPageChrome(title: pageTitle, onBack: {
            if !navigation.path.isEmpty { navigation.pop() }
        })
    }

    private var pageTitle: String {
        guard let entry else { return "" }
        return entry.kind == .photoNote ? PlanningText.string(.photoAndLine) : PlanningText.string(.anythingDiary)
    }

    private var dateLabel: String {
        switch scope {
        case .period(let bucket, let key):
            PeriodCalendar.label(bucket: bucket, key: key)
        case .future(let year):
            "\(year)"
        }
    }

    @ViewBuilder
    private func completed(_ entry: PlanningMemoryEntry) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(dateLabel)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(PlanningPalette.accent)
            if entry.kind == .photoNote {
                photoImage(entry)
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: 320)
                Text(entry.text)
                    .font(.system(size: 17))
                    .foregroundStyle(PlanningPalette.ink)
            } else {
                Text(entry.title)
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(PlanningPalette.ink)
                Text(entry.text)
                    .font(.system(size: 16))
                    .foregroundStyle(PlanningPalette.ink)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private func photoImage(_ entry: PlanningMemoryEntry) -> some View {
        if let data = entry.imageData, let image = UIImage(data: data) {
            Image(uiImage: image)
                .resizable()
                .scaledToFit()
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        } else {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(PlanningPalette.card)
                .overlay { Text("写真").foregroundStyle(PlanningPalette.muted) }
        }
    }

    private func photoEditor(_ entry: PlanningMemoryEntry) -> some View {
        VStack(spacing: 16) {
            PhotosPicker(selection: $photo, matching: .images) {
                photoImage(entry)
                    .frame(maxWidth: .infinity)
                    .frame(height: 280)
            }
            TextField("一言", text: memoryText(entry))
                .textFieldStyle(.roundedBorder)
            PlanningGlassAction(title: PlanningText.string(.save)) {
                session.saveMemory(id: entry.id)
            }
        }
        .padding(16)
        .onChange(of: photo) { _, item in
            Task {
                let data = try? await item?.loadTransferable(type: Data.self)
                session.updateMemory(id: entry.id, text: entry.text, title: entry.title, dateText: entry.dateText, hasPhoto: data != nil, imageData: data)
            }
        }
    }

    private func diaryEditor(_ entry: PlanningMemoryEntry) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            TextField("タイトル", text: memoryTitle(entry))
                .font(.title3.weight(.semibold))
            TextField("本文", text: memoryText(entry), axis: .vertical)
                .lineLimit(8...16)
            PlanningGlassAction(title: PlanningText.string(.save)) {
                session.saveMemory(id: entry.id)
            }
        }
        .padding(16)
    }

    private func memoryText(_ entry: PlanningMemoryEntry) -> Binding<String> {
        Binding(
            get: { session.memoryEntries.first { $0.id == entry.id }?.text ?? entry.text },
            set: { session.updateMemory(id: entry.id, text: $0, title: entry.title, dateText: entry.dateText, hasPhoto: entry.hasPhoto, imageData: entry.imageData) }
        )
    }

    private func memoryTitle(_ entry: PlanningMemoryEntry) -> Binding<String> {
        Binding(
            get: { session.memoryEntries.first { $0.id == entry.id }?.title ?? entry.title },
            set: { session.updateMemory(id: entry.id, text: entry.text, title: $0, dateText: entry.dateText, hasPhoto: entry.hasPhoto, imageData: entry.imageData) }
        )
    }
}
