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

    @State private var step = ReflectionFlowStep.overview

    var body: some View {
        Group {
            if completed {
                detailPage
            } else if step == .overview {
                overviewPage
            } else {
                classificationPage
            }
        }
        .planningPageChrome(title: pageTitle, onBack: {
            if !navigation.path.isEmpty { navigation.pop() }
        })
        .planningExtendingSurface(PlanningPalette.paper)
        .onAppear {
            if !completed { session.beginReflection(scope) }
        }
    }

    private var pageTitle: String {
        if completed { return PlanningText.string(.reflectionResult) }
        if step == .classification { return "維持 / 先送り / 終了" }
        switch scope {
        case .period(.monthly, _): return "今月の振り返り"
        case .period(.weekly, _): return "今週の振り返り"
        case .period(.daily, _), .future: return "今日の振り返り"
        }
    }

    private var overviewPage: some View {
        let items = session.reflectionItems(scope)
        let todos = items.filter { $0.kind == .task }
        let events = items.filter { $0.kind == .event }
        let done = items.filter(\.completed).count
        let total = items.count
        return ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(periodContext)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(PlanningPalette.accent)
                ReflectionProgressRing(done: done, total: total)
                Text("完了 \(done)  未完了 \(max(0, total - done))")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(PlanningPalette.ink)
                Text("完了と未完了を確認してから、次の分類へ進みます。")
                    .font(.system(size: 14))
                    .foregroundStyle(PlanningPalette.muted)
                completionGroup(title: "ToDo", items: todos)
                completionGroup(title: "予定", items: events)
            }
            .padding(16)
            .padding(.bottom, 12)
        }
        .planningScroll()
        .safeAreaInset(edge: .bottom, spacing: 0) {
            PlanningGlassAction(title: "次へ") { step = .classification }
        }
    }

    private var classificationPage: some View {
        let items = session.reflectionItems(scope)
        return ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(periodContext)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(PlanningPalette.muted)
                classifiedGroup(title: "ToDo", items: items.filter { $0.kind == .task })
                classifiedGroup(title: "予定", items: items.filter { $0.kind == .event })
            }
            .padding(16)
            .padding(.bottom, 12)
        }
        .planningScroll()
        .safeAreaInset(edge: .bottom, spacing: 0) {
            PlanningGlassAction(title: "完了") {
                if session.completeReflection(scope: scope), !navigation.path.isEmpty {
                    navigation.pop()
                }
            }
            .disabled(!session.canCompleteReflection(scope))
        }
    }

    private var detailPage: some View {
        let rows = session.decisions(for: scope)
        let editable = session.reflectionIsEditable(scope)
        return ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                ReflectionPeriodLabel(text: periodContext)
                ReflectionAchievementCard(session: session, scope: scope)
                ReflectionClassificationCard(session: session, scope: scope)
                ReflectionDispositionCard(title: "ToDo の振り返り結果", icon: "checkmark.square", rows: rows.filter { $0.kind == .task })
                ReflectionDispositionCard(title: "予定 の振り返り結果", icon: "calendar", rows: rows.filter { $0.kind == .event })
                Button {
                    guard editable else { return }
                    PlanningTransition.perform { navigation.path.append(PlanningRoute.reflectionEdit(scope)) }
                } label: {
                    Label("振り返りの編集", systemImage: "pencil")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Color.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: PlanningTokens.ReflectionSummary.actionHeight)
                        .background(PlanningPalette.accent, in: RoundedRectangle(cornerRadius: PlanningTokens.ReflectionSummary.actionRadius, style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(!editable)
                ReflectionEditabilityAlert(editable: editable)
            }
            .padding(.horizontal, PlanningTokens.ReflectionSummary.inset)
            .padding(.vertical, 12)
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

    private func completionGroup(title: String, items: [ReflectionItem]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.system(size: 16, weight: .semibold))
            labeledItems("完了", items.filter(\.completed).map(\.title))
            labeledItems("未完了", items.filter { !$0.completed }.map(\.title))
        }
    }

    private func labeledItems(_ label: String, _ titles: [String]) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.system(size: 13, weight: .semibold)).foregroundStyle(PlanningPalette.muted)
            if titles.isEmpty {
                Text("なし").font(.system(size: 14)).foregroundStyle(PlanningPalette.muted)
            } else {
                ForEach(titles, id: \.self) { title in
                    Text(title.isEmpty ? "無題" : title)
                        .font(.system(size: 15))
                        .foregroundStyle(PlanningPalette.ink)
                }
            }
        }
    }

    private func classifiedGroup(title: String, items: [ReflectionItem]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title).font(.system(size: 16, weight: .semibold))
            ForEach(items) { item in
                decisionRow(item)
            }
        }
    }

    private func decisionRow(_ item: ReflectionItem) -> some View {
        let selected = session.reflectionDraft?.decisions[item.id]
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text(item.title.isEmpty ? "無題" : item.title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(PlanningPalette.ink)
                Spacer(minLength: 8)
                Text(item.completed ? "完了" : "未完了")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(PlanningPalette.muted)
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
                .foregroundStyle(on ? Color.white : tone(value))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .background(on ? tone(value) : tone(value).opacity(0.16))
        }
        .buttonStyle(.plain)
    }

    private func tone(_ value: ReflectionDisposition) -> Color {
        switch value {
        case .keep: PlanningPalette.keep
        case .postpone: PlanningPalette.postpone
        case .stop: PlanningPalette.stop
        }
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
            Text(PlanningText.string(.startReflection))
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(accent)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .frame(height: PlanningTokens.ReflectionDue.height(tabBar: tabBarHeight))
        .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

        Button(action: action) {
            if #available(iOS 26.0, *) {
                card.glassEffect(.regular.interactive(), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            } else {
                card.background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
        }
        .buttonStyle(.plain)
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

struct ReflectionPeriodSummary: View {
    @ObservedObject var session: PlanningSession
    @EnvironmentObject private var navigation: TabNavigationState
    let scope: ReflectionScope

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            ReflectionPeriodLabel(text: periodLabel)
            ReflectionAchievementCard(session: session, scope: scope)
            ReflectionClassificationCard(session: session, scope: scope)
            Button {
                PlanningTransition.perform { navigation.path.append(PlanningRoute.reflection(scope)) }
            } label: {
                Text("詳細を見る")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Color.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: PlanningTokens.ReflectionSummary.actionHeight)
                    .background(PlanningPalette.accent, in: RoundedRectangle(cornerRadius: PlanningTokens.ReflectionSummary.actionRadius, style: .continuous))
            }
            .buttonStyle(.plain)
        }
    }

    private var periodLabel: String {
        switch scope {
        case .period(let bucket, let key): PeriodCalendar.label(bucket: bucket, key: key)
        case .future(let year): "\(year)年"
        }
    }
}

struct ReflectionPeriodLabel: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 22, weight: .bold))
            .foregroundStyle(PlanningPalette.accent)
            .lineLimit(1)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct ReflectionAchievementCard: View {
    @ObservedObject var session: PlanningSession
    let scope: ReflectionScope

    var body: some View {
        let completion = session.snapshotCompletion(for: scope)
        let total = completion.todoTotal + completion.eventTotal
        let done = completion.todoDone + completion.eventDone
        return HStack(alignment: .center, spacing: 12) {
            ReflectionSummaryRing(done: done, total: total)
            VStack(spacing: 0) {
                achievementRow(
                    icon: "checkmark",
                    tint: PlanningPalette.keep,
                    title: "ToDo",
                    detail: "\(completion.todoTotal)件中 \(completion.todoDone)件完了",
                    percent: percent(completion.todoDone, completion.todoTotal)
                )
                Divider().overlay(PlanningPalette.line)
                achievementRow(
                    icon: "calendar",
                    tint: PlanningPalette.postpone,
                    title: "予定",
                    detail: "\(completion.eventTotal)件中 \(completion.eventDone)件実施",
                    percent: percent(completion.eventDone, completion.eventTotal)
                )
            }
        }
        .padding(PlanningTokens.ReflectionSummary.cardPadding)
        .frame(minHeight: 132)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white, in: RoundedRectangle(cornerRadius: PlanningTokens.ReflectionSummary.cardRadius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: PlanningTokens.ReflectionSummary.cardRadius, style: .continuous).stroke(PlanningPalette.line, lineWidth: 1))
    }

    private func achievementRow(icon: String, tint: Color, title: String, detail: String, percent: Int) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 40, height: 40)
                .background(tint.opacity(0.16), in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.system(size: 17, weight: .semibold)).foregroundStyle(PlanningPalette.ink)
                Text(detail).font(.system(size: 14)).foregroundStyle(PlanningPalette.muted)
            }
            Spacer(minLength: 4)
            Text("\(percent)%").font(.system(size: 20, weight: .semibold)).foregroundStyle(PlanningPalette.ink)
        }
        .padding(.vertical, 8)
    }

    private func percent(_ done: Int, _ total: Int) -> Int {
        guard total > 0 else { return 0 }
        return Int((Double(done) / Double(total) * 100).rounded())
    }
}

struct ReflectionSummaryRing: View {
    let done: Int
    let total: Int

    private var fraction: CGFloat {
        guard total > 0 else { return 0 }
        return CGFloat(done) / CGFloat(total)
    }

    var body: some View {
        ZStack {
            Circle().stroke(PlanningPalette.line.opacity(0.45), lineWidth: PlanningTokens.ReflectionSummary.ringThickness)
            Circle()
                .trim(from: 0, to: fraction)
                .stroke(PlanningPalette.accent, style: StrokeStyle(lineWidth: PlanningTokens.ReflectionSummary.ringThickness, lineCap: .round))
                .rotationEffect(.degrees(-90))
            VStack(spacing: 2) {
                Text("\(Int((fraction * 100).rounded()))%")
                    .font(.system(size: 32, weight: .bold))
                    .foregroundStyle(PlanningPalette.ink)
                Text("全体の達成率")
                    .font(.system(size: 12))
                    .foregroundStyle(PlanningPalette.muted)
            }
        }
        .frame(width: PlanningTokens.ReflectionSummary.ringDiameter, height: PlanningTokens.ReflectionSummary.ringDiameter)
    }
}

struct ReflectionClassificationCard: View {
    @ObservedObject var session: PlanningSession
    let scope: ReflectionScope

    var body: some View {
        let counts = session.classificationCounts(for: scope)
        return VStack(alignment: .leading, spacing: 12) {
            Text("振り返りの分類結果")
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(PlanningPalette.ink)
            HStack(spacing: PlanningTokens.ReflectionSummary.blockGap) {
                classificationBlock("維持", count: counts.keep, icon: "leaf", tint: PlanningPalette.keep)
                classificationBlock("先送り", count: counts.postpone, icon: "clock", tint: PlanningPalette.postpone)
                classificationBlock("終了", count: counts.stop, icon: "xmark", tint: PlanningPalette.stop)
            }
        }
        .padding(PlanningTokens.ReflectionSummary.cardPadding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white, in: RoundedRectangle(cornerRadius: PlanningTokens.ReflectionSummary.cardRadius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: PlanningTokens.ReflectionSummary.cardRadius, style: .continuous).stroke(PlanningPalette.line, lineWidth: 1))
    }

    private func classificationBlock(_ title: String, count: Int, icon: String, tint: Color) -> some View {
        VStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 28, height: 28)
                .background(Color.white.opacity(0.7), in: Circle())
            Text(title).font(.system(size: 13, weight: .semibold)).foregroundStyle(tint)
            Text("\(count)件").font(.system(size: 16, weight: .bold)).foregroundStyle(tint)
        }
        .frame(maxWidth: .infinity)
        .frame(height: PlanningTokens.ReflectionSummary.blockHeight)
        .background(tint.opacity(0.14), in: RoundedRectangle(cornerRadius: PlanningTokens.ReflectionSummary.blockRadius, style: .continuous))
    }
}

struct ReflectionDispositionCard: View {
    let title: String
    let icon: String
    let rows: [StoredReflectionDecision]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(PlanningPalette.accent)
                    .frame(width: 28, height: 28)
                Text(title)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(PlanningPalette.ink)
            }
            dispositionGroup("維持", rows.filter { $0.disposition == .keep }, PlanningPalette.keep)
            Divider().overlay(PlanningPalette.line)
            dispositionGroup("先送り", rows.filter { $0.disposition == .postpone }, PlanningPalette.postpone)
            Divider().overlay(PlanningPalette.line)
            dispositionGroup("終了", rows.filter { $0.disposition == .stop }, PlanningPalette.stop)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(PlanningPalette.line, lineWidth: 1))
    }

    private func dispositionGroup(_ label: String, _ rows: [StoredReflectionDecision], _ tint: Color) -> some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(.system(size: 14, weight: .semibold)).foregroundStyle(tint)
                Text("\(rows.count)件").font(.system(size: 13, weight: .semibold)).foregroundStyle(tint)
            }
            .frame(width: 72, alignment: .leading)
            VStack(alignment: .leading, spacing: 4) {
                if rows.isEmpty {
                    Text("該当する項目はありません")
                        .font(.system(size: 14))
                        .foregroundStyle(PlanningPalette.muted)
                } else {
                    ForEach(rows) { row in
                        HStack(spacing: 6) {
                            Circle().fill(tint).frame(width: 7, height: 7)
                            Text(row.title.isEmpty ? "無題" : row.title)
                                .font(.system(size: 15))
                                .foregroundStyle(PlanningPalette.ink)
                        }
                    }
                }
            }
            Spacer(minLength: 0)
        }
    }
}

struct ReflectionEditabilityAlert: View {
    let editable: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: editable ? "info.circle" : "exclamationmark.triangle")
                .foregroundStyle(editable ? PlanningPalette.accent : PlanningPalette.stop)
            VStack(alignment: .leading, spacing: 4) {
                Text(editable ? "この振り返りは現在編集できます。" : "この振り返りの編集可能期間は終了しています。")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(PlanningPalette.ink)
                if editable {
                    Text("編集可能範囲は Daily 7件 / Weekly 4件 / Monthly 1件です。")
                    Text("新しい振り返りが追加されると、古いものから編集できなくなります。")
                } else {
                    Text("結果は引き続き確認できますが、分類を変更することはできません。")
                    Text("編集可能範囲: Daily 7件 / Weekly 4件 / Monthly 1件")
                }
            }
            .font(.system(size: 13))
            .foregroundStyle(PlanningPalette.muted)
        }
        .padding(15)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background((editable ? PlanningPalette.accent : PlanningPalette.stop).opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(editable ? PlanningPalette.accent.opacity(0.45) : PlanningPalette.stop.opacity(0.45), lineWidth: 1)
        )
    }
}

private enum ReflectionFlowStep {
    case overview
    case classification
}

struct ReflectionProgressRing: View {
    let done: Int
    let total: Int
    var diameter: CGFloat = PlanningTokens.PeriodBody.progressDiameter

    private var fraction: CGFloat {
        guard total > 0 else { return 0 }
        return CGFloat(done) / CGFloat(total)
    }

    var body: some View {
        ZStack {
            Circle().stroke(PlanningPalette.line, lineWidth: 7)
            Circle()
                .trim(from: 0, to: fraction)
                .stroke(PlanningPalette.accent, style: StrokeStyle(lineWidth: 7, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Text("\(Int((fraction * 100).rounded()))%")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(PlanningPalette.ink)
        }
        .frame(width: diameter, height: diameter)
        .accessibilityLabel("\(done) / \(total)")
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
        .planningPageChrome(title: "振り返り履歴", onBack: {
            if !navigation.path.isEmpty { navigation.pop() }
        })
        .planningExtendingSurface(PlanningPalette.paper)
    }

    private func historyCard(_ scope: ReflectionScope) -> some View {
        let counts = session.classificationCounts(for: scope)
        return Button {
            PlanningTransition.perform { navigation.path.append(PlanningRoute.reflectionEdit(scope)) }
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
        .planningPageChrome(title: "振り返りを編集", onBack: {
            if !navigation.path.isEmpty { navigation.pop() }
        })
        .planningExtendingSurface(PlanningPalette.paper)
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
        .planningPageChrome(title: "Reflection Settings", onBack: {
            if !navigation.path.isEmpty { navigation.pop() }
        })
        .planningExtendingSurface(PlanningPalette.paper)
    }
}

struct SavedPeriodMemory: View {
    @ObservedObject var session: PlanningSession
    @EnvironmentObject private var navigation: TabNavigationState
    let entry: PlanningMemoryEntry
    let scope: ReflectionScope

    var body: some View {
        if entry.kind == .photoNote {
            VStack(alignment: .leading, spacing: 8) {
                Button { openEditor() } label: { savedPhoto }
                    .buttonStyle(.plain)
                Button { openEditor() } label: {
                    Text(entry.text.isEmpty ? "一言を入力" : entry.text)
                        .font(.system(size: 16))
                        .foregroundStyle(PlanningPalette.ink)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.plain)
            }
        } else {
            VStack(alignment: .leading, spacing: 8) {
                Text(entry.dateText.isEmpty ? periodLabel : entry.dateText)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(PlanningPalette.muted)
                Button { openEditor() } label: {
                    Text(entry.title.isEmpty ? "無題" : entry.title)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(PlanningPalette.ink)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.plain)
                Button { openEditor() } label: {
                    Text(entry.text)
                        .font(.system(size: 15))
                        .foregroundStyle(PlanningPalette.ink)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var savedPhoto: some View {
        ZStack {
            if let data = entry.imageData, let image = UIImage(data: data) {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                PlanningPalette.card
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: 220)
        .clipped()
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var periodLabel: String {
        switch scope {
        case .period(let bucket, let key): PeriodCalendar.label(bucket: bucket, key: key)
        case .future(let year): "\(year)"
        }
    }

    private func openEditor() {
        PlanningTransition.perform { navigation.path.append(PlanningRoute.planningMemory(scope)) }
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
                PlanningTransition.perform { navigation.path.append(PlanningRoute.planningMemory(scope)) }
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
            PlanningTransition.perform { navigation.path.append(PlanningRoute.planningMemory(scope)) }
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
                if entry.kind == .photoNote {
                    photoEditor(entry)
                } else {
                    diaryEditor(entry)
                }
            }
        }
        .planningScroll()
        .planningKeyboardDismiss()
        .planningPageChrome(title: pageTitle, onBack: {
            if !navigation.path.isEmpty { navigation.pop() }
        })
        .planningExtendingSurface(PlanningPalette.paper)
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

    private func photoEditor(_ entry: PlanningMemoryEntry) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("写真を1枚と、一言だけ残せます。")
                .font(.system(size: 15))
                .foregroundStyle(PlanningPalette.muted)
            PhotosPicker(selection: $photo, matching: .images) {
                photoWell(entry)
            }
            .buttonStyle(.plain)
            TextField("一言を入力", text: memoryText(entry))
                .font(.system(size: 16))
                .padding(.horizontal, 12)
                .frame(height: 46)
                .background(Color.white, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(PlanningPalette.line, lineWidth: 1))
            PlanningGlassAction(title: "保存") {
                session.saveMemory(id: entry.id)
                if !navigation.path.isEmpty { navigation.pop() }
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

    private func photoWell(_ entry: PlanningMemoryEntry) -> some View {
        ZStack {
            if let data = entry.imageData, let image = UIImage(data: data) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else {
                VStack(spacing: 8) {
                    Image(systemName: "photo.badge.plus")
                        .font(.system(size: 28, weight: .regular))
                        .foregroundStyle(PlanningPalette.accent)
                    Text("写真を追加")
                        .font(.system(size: 14))
                        .foregroundStyle(PlanningPalette.muted)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: 280)
        .clipped()
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .background(PlanningPalette.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func diaryEditor(_ entry: PlanningMemoryEntry) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("形式を決めずに、その期間のことを残せます。")
                .font(.system(size: 15))
                .foregroundStyle(PlanningPalette.muted)
            Text(dateLabel)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(PlanningPalette.muted)
            TextField("タイトル", text: memoryTitle(entry))
                .font(.system(size: 18, weight: .semibold))
                .padding(.horizontal, 12)
                .frame(height: 46)
                .background(Color.white, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            TextField("本文", text: memoryText(entry), axis: .vertical)
                .lineLimit(8...16)
                .padding(12)
                .frame(minHeight: 180, alignment: .topLeading)
                .background(Color.white, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            PlanningGlassAction(title: "保存") {
                session.saveMemory(id: entry.id)
                if !navigation.path.isEmpty { navigation.pop() }
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
