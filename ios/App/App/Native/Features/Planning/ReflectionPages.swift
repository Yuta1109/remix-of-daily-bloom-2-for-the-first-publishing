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
        if step == .classification { return PlanningText.string(.reflectionClassify) }
        switch scope {
        case .period(.monthly, _): return PlanningText.string(.reflectionMonth)
        case .period(.weekly, _): return PlanningText.string(.reflectionWeek)
        case .period(.daily, _), .future: return PlanningText.string(.reflectionToday)
        }
    }

    private var overviewPage: some View {
        let items = session.reflectionItems(scope)
        let todos = items.filter { $0.kind == .task }
        let events = items.filter { $0.kind == .event }
        let done = items.filter(\.completed).count
        let total = items.count
        return ScrollView {
            VStack(alignment: .leading, spacing: 15) {
                Text(periodContext)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(PlanningPalette.accent)
                    .padding(.top, 8)
                ReflectionOverviewCard(done: done, total: total)
                ReflectionReviewSection(title: "ToDo", systemImage: "checkmark", items: todos)
                ReflectionReviewSection(title: "予定", systemImage: "calendar", items: events)
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 12)
        }
        .planningScroll()
        .safeAreaInset(edge: .bottom, spacing: 0) {
            PlanningGlassAction(title: PlanningText.string(.reflectionNext), showsChevron: true) { step = .classification }
                .padding(.bottom, 8)
        }
    }

    private var classificationPage: some View {
        let items = session.reflectionItems(scope)
        return ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text(periodContext)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(PlanningPalette.accent)
                    .padding(.top, 8)
                ReflectionClassificationIntro(scope: scope)
                    .padding(.top, 16)
                ReflectionClassifyHeader(title: "ToDo", systemImage: "checkmark")
                    .padding(.top, 20)
                classifiedGroup(items.filter { $0.kind == .task })
                ReflectionClassifyHeader(title: "予定", systemImage: "calendar")
                    .padding(.top, 22)
                classifiedGroup(items.filter { $0.kind == .event })
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 12)
        }
        .planningScroll()
        .safeAreaInset(edge: .bottom, spacing: 0) {
            PlanningGlassAction(title: PlanningText.string(.reflectionFinish)) {
                if session.completeReflection(scope: scope), !navigation.path.isEmpty {
                    navigation.pop()
                }
            }
            .disabled(!session.canCompleteReflection(scope))
            .padding(.bottom, 8)
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

    private func classifiedGroup(_ items: [ReflectionItem]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                if index > 0 {
                    Rectangle()
                        .fill(PlanningPalette.line)
                        .frame(height: 0.6)
                        .padding(.vertical, 13)
                }
                decisionRow(item)
            }
        }
    }

    private func decisionRow(_ item: ReflectionItem) -> some View {
        let selected = session.reflectionDraft?.decisions[item.id]
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text(item.title.isEmpty ? "無題" : item.title)
                    .font(.system(size: 16.5, weight: .semibold))
                    .foregroundStyle(PlanningPalette.ink)
                Spacer(minLength: 8)
                Text(item.completed ? "完了" : "未完了")
                    .font(.system(size: 13.5, weight: .semibold))
                    .foregroundStyle(PlanningPalette.muted)
            }
            ReflectionDispositionControl(selected: selected) { value in
                session.setDraftDecision(itemID: item.id, disposition: value)
            }
        }
    }

}

struct ReflectionOverviewCard: View {
    let done: Int
    let total: Int

    private var fraction: Double {
        guard total > 0 else { return 0 }
        return Double(done) / Double(total)
    }

    private var percent: Int { Int((fraction * 100).rounded()) }

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            ZStack {
                Circle()
                    .stroke(Color(red: 0.86, green: 0.82, blue: 0.76), lineWidth: 8.5)
                Circle()
                    .trim(from: 0, to: fraction)
                    .stroke(PlanningPalette.accent, style: StrokeStyle(lineWidth: 8.5, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                Text("\(percent)%")
                    .font(.system(size: percent == 100 ? 26 : 29, weight: .bold))
                    .foregroundStyle(PlanningPalette.ink)
                    .minimumScaleFactor(0.7)
            }
            .frame(width: 94, height: 94)
            Rectangle()
                .fill(PlanningPalette.line)
                .frame(width: 1)
                .padding(.vertical, 6)
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 14) {
                    countPair(PlanningText.isEnglish ? "Done" : "完了", done)
                    countPair(PlanningText.isEnglish ? "Not done" : "未完了", max(0, total - done))
                }
                Text(PlanningText.string(.reflectionReviewHint))
                    .font(.system(size: 14.5))
                    .foregroundStyle(PlanningPalette.muted)
                    .lineSpacing(5)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 120, alignment: .leading)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous).stroke(PlanningPalette.line, lineWidth: 0.8))
        .shadow(color: PlanningPalette.ink.opacity(0.04), radius: 6, y: 2)
    }

    private func countPair(_ label: String, _ value: Int) -> some View {
        HStack(spacing: 6) {
            Text(label)
                .font(.system(size: 15.5))
                .foregroundStyle(PlanningPalette.ink)
            Text("\(value)")
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(PlanningPalette.ink)
        }
    }
}

struct ReflectionReviewSection: View {
    let title: String
    let systemImage: String
    let items: [ReflectionItem]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: systemImage)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(Color.white)
                    .frame(width: 31, height: 31)
                    .background(PlanningPalette.accent, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                Text(title)
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(PlanningPalette.ink)
            }
            .padding(.horizontal, 14)
            .frame(maxWidth: .infinity, minHeight: 50, alignment: .leading)
            .background(PlanningPalette.accent.opacity(0.08))
            VStack(alignment: .leading, spacing: 12) {
                statusGroup("完了", items.filter(\.completed), incomplete: false)
                statusGroup("未完了", items.filter { !$0.completed }, incomplete: true)
            }
            .padding(14)
        }
        .background(Color.white, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous).stroke(PlanningPalette.line, lineWidth: 0.8))
        .shadow(color: PlanningPalette.ink.opacity(0.04), radius: 6, y: 2)
    }

    private func statusGroup(_ label: String, _ rows: [ReflectionItem], incomplete: Bool) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .center, spacing: 10) {
                Text(label)
                    .font(.system(size: 13.5, weight: .semibold))
                    .foregroundStyle(incomplete ? Color(red: 0.62, green: 0.32, blue: 0.28) : PlanningPalette.muted)
                    .frame(width: 62, height: 29)
                    .background(
                        incomplete ? Color(red: 0.96, green: 0.90, blue: 0.88) : Color(red: 0.94, green: 0.92, blue: 0.89),
                        in: RoundedRectangle(cornerRadius: 8, style: .continuous)
                    )
                if rows.isEmpty {
                    Text(PlanningText.string(.reflectionNone))
                        .font(.system(size: 15))
                        .foregroundStyle(PlanningPalette.muted)
                }
            }
            ForEach(rows) { item in
                HStack(spacing: 10) {
                    Circle()
                        .stroke(PlanningPalette.muted.opacity(0.7), lineWidth: 1.4)
                        .frame(width: 16, height: 16)
                    Text(item.title.isEmpty ? "無題" : item.title)
                        .font(.system(size: 15.5))
                        .foregroundStyle(PlanningPalette.ink)
                }
            }
        }
    }
}

struct ReflectionClassificationIntro: View {
    let scope: ReflectionScope

    private var heading: String {
        switch scope {
        case .period(.weekly, _): PlanningText.string(.reflectionStep2Weekly)
        case .period(.monthly, _): PlanningText.string(.reflectionStep2Monthly)
        case .period(.daily, _), .future: PlanningText.string(.reflectionStep2Daily)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "leaf")
                    .font(.system(size: 16))
                    .foregroundStyle(Color(red: 0.55, green: 0.62, blue: 0.42))
                VStack(alignment: .leading, spacing: 4) {
                    Text(heading)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(PlanningPalette.ink)
                    Text(PlanningText.string(.reflectionStep2Body))
                        .font(.system(size: 13.5))
                        .foregroundStyle(PlanningPalette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Rectangle().fill(PlanningPalette.line).frame(height: 0.6)
            HStack(alignment: .top, spacing: 8) {
                meaning(Color(red: 0.435, green: 0.616, blue: 0.447), "維持", PlanningText.string(.reflectionKeepMeaning))
                meaning(Color(red: 0.765, green: 0.584, blue: 0.239), "先送り", PlanningText.string(.reflectionPostponeMeaning))
                meaning(Color(red: 0.749, green: 0.361, blue: 0.314), "終了", PlanningText.string(.reflectionStopMeaning))
            }
        }
        .padding(16)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous).stroke(PlanningPalette.line, lineWidth: 0.8))
    }

    private func meaning(_ color: Color, _ title: String, _ body: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 5) {
                Circle().fill(color).frame(width: 8, height: 8)
                Text(title).font(.system(size: 13, weight: .semibold)).foregroundStyle(PlanningPalette.ink)
            }
            Text(body)
                .font(.system(size: 11))
                .foregroundStyle(PlanningPalette.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct ReflectionClassifyHeader: View {
    let title: String
    let systemImage: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: systemImage)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(PlanningPalette.accent)
            Text(title)
                .font(.system(size: 21, weight: .bold))
                .foregroundStyle(PlanningPalette.ink)
            Rectangle()
                .fill(PlanningPalette.line)
                .frame(height: 0.6)
        }
        .padding(.bottom, 12)
    }
}

struct ReflectionDispositionControl: View {
    let selected: ReflectionDisposition?
    let onSelect: (ReflectionDisposition) -> Void
    private let neutralFill = Color(red: 0.914, green: 0.906, blue: 0.886)
    private let neutralText = Color(red: 0.455, green: 0.435, blue: 0.408)

    var body: some View {
        HStack(spacing: 0) {
            segment(.keep, "維持")
            segment(.postpone, "先送り")
            segment(.stop, "終了")
        }
        .frame(height: 36)
        .background(neutralFill, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
    }

    private func segment(_ value: ReflectionDisposition, _ title: String) -> some View {
        let on = selected == value
        return Button { onSelect(value) } label: {
            Text(title)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(on ? Color.white : neutralText)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(on ? tone(value) : neutralFill)
        }
        .buttonStyle(.plain)
    }

    private func tone(_ value: ReflectionDisposition) -> Color {
        switch value {
        case .keep: Color(red: 0.435, green: 0.616, blue: 0.447)
        case .postpone: Color(red: 0.765, green: 0.584, blue: 0.239)
        case .stop: Color(red: 0.749, green: 0.361, blue: 0.314)
        }
    }
}

struct PlanningTutorialBanner: View {
    let systemImage: String
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: systemImage)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(PlanningPalette.accent)
                .frame(width: 22)
            Text(text)
                .font(.system(size: 14))
                .foregroundStyle(PlanningPalette.ink)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 13)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PlanningPalette.accent.opacity(0.12), in: RoundedRectangle(cornerRadius: 13, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous).stroke(PlanningPalette.accent.opacity(0.35), lineWidth: 1))
    }
}

struct PeriodArrowAttentionBadge: View {
    var body: some View {
        Text("!")
            .font(.system(size: 10, weight: .bold))
            .foregroundStyle(Color.white)
            .frame(width: 16, height: 16)
            .background(Color(red: 0.910, green: 0.306, blue: 0.310), in: Circle())
            .overlay(Circle().stroke(Color.white, lineWidth: 1.25))
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
        VStack(alignment: .leading, spacing: 16) {
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
                    detail: "\(completion.todoTotal)件中\(completion.todoDone)件完了",
                    percent: percent(completion.todoDone, completion.todoTotal)
                )
                Divider().overlay(PlanningPalette.line)
                achievementRow(
                    icon: "calendar",
                    tint: PlanningPalette.postpone,
                    title: "予定",
                    detail: "\(completion.eventTotal)件中\(completion.eventDone)件実施",
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
                HStack(spacing: 8) {
                    Text(title).font(.system(size: 17, weight: .semibold)).foregroundStyle(PlanningPalette.ink)
                    Text("\(percent)%").font(.system(size: 20, weight: .semibold)).foregroundStyle(PlanningPalette.ink)
                }
                Text(detail).font(.system(size: 14)).foregroundStyle(PlanningPalette.muted)
            }
            Spacer(minLength: 0)
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

private enum PhotoMemoryPalette {
    static let ivory = Color(red: 0.961, green: 0.945, blue: 0.910)
    static let ink = Color(red: 0.133, green: 0.102, blue: 0.078)
    static let taupe = Color(red: 0.557, green: 0.471, blue: 0.408)
    static let accent = Color(red: 0.878, green: 0.541, blue: 0.263)
    static let border = Color(red: 0.867, green: 0.820, blue: 0.765)
    static let moulding = Color(red: 0.953, green: 0.933, blue: 0.894)
    static let mat = Color(red: 0.984, green: 0.969, blue: 0.941)
    static let brass = Color(red: 0.722, green: 0.541, blue: 0.310)
    static let brassLight = Color(red: 0.91, green: 0.78, blue: 0.52)
    static let brassDark = Color(red: 0.48, green: 0.34, blue: 0.16)
    static let beam = Color(red: 1, green: 0.96, blue: 0.84)
}

struct PhotoMemoryAspectPicker: View {
    @Binding var selection: PhotoMemoryAspectRatio

    var body: some View {
        HStack(spacing: 18) {
            ForEach(PhotoMemoryAspectRatio.allCases) { ratio in
                Button { selection = ratio } label: {
                    HStack(spacing: 8) {
                        aspectGlyph(ratio)
                        Text(ratio.label)
                            .font(.system(size: 17.5, weight: .semibold))
                    }
                    .foregroundStyle(selection == ratio ? PhotoMemoryPalette.accent : PhotoMemoryPalette.taupe)
                    .frame(maxWidth: .infinity)
                    .frame(height: 76)
                    .background(
                        selection == ratio ? PhotoMemoryPalette.accent.opacity(0.08) : Color.white.opacity(0.72),
                        in: RoundedRectangle(cornerRadius: 26, style: .continuous)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 26, style: .continuous)
                            .stroke(selection == ratio ? PhotoMemoryPalette.accent : PhotoMemoryPalette.border, lineWidth: selection == ratio ? 2 : 1)
                    )
                }
                .buttonStyle(.plain)
                .layoutPriority(ratio == .landscape ? 1.12 : 1)
            }
        }
    }

    @ViewBuilder
    private func aspectGlyph(_ ratio: PhotoMemoryAspectRatio) -> some View {
        switch ratio {
        case .landscape:
            Image(systemName: "photo")
                .font(.system(size: 18, weight: .regular))
        case .portrait:
            RoundedRectangle(cornerRadius: 3, style: .continuous)
                .stroke(lineWidth: 1.6)
                .frame(width: 12, height: 18)
        case .square:
            RoundedRectangle(cornerRadius: 2.5, style: .continuous)
                .stroke(lineWidth: 1.6)
                .frame(width: 15, height: 15)
        }
    }
}

struct PhotoMemoryPickerCard: View {
    let aspect: PhotoMemoryAspectRatio
    let image: UIImage?
    let contentWidth: CGFloat

    private var previewWidth: CGFloat { max(contentWidth * aspect.editorWidthFraction, 1) }
    private var previewHeight: CGFloat { previewWidth / aspect.widthOverHeight }

    var body: some View {
        ZStack {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(width: previewWidth, height: previewHeight)
                    .clipped()
            } else {
                VStack(spacing: 10) {
                    Image(systemName: "photo.badge.plus")
                        .font(.system(size: 30, weight: .regular))
                        .foregroundStyle(PhotoMemoryPalette.accent)
                    Text("写真を追加")
                        .font(.system(size: 15))
                        .foregroundStyle(PhotoMemoryPalette.taupe)
                }
            }
        }
        .frame(width: previewWidth, height: previewHeight)
        .background(Color.white.opacity(0.9), in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).stroke(PhotoMemoryPalette.border, lineWidth: 1))
        .shadow(color: PhotoMemoryPalette.ink.opacity(0.06), radius: 12, y: 6)
        .frame(maxWidth: .infinity)
    }
}

struct PhotoMemoryGrowingField: UIViewRepresentable {
    @Binding var text: String
    @Binding var measuredHeight: CGFloat

    func makeUIView(context: Context) -> PhotoCaptionTextView {
        let view = PhotoCaptionTextView()
        view.delegate = context.coordinator
        view.font = .systemFont(ofSize: 17)
        view.backgroundColor = .clear
        view.textContainerInset = UIEdgeInsets(top: 16, left: 14, bottom: 16, right: 14)
        view.textContainer.lineFragmentPadding = 0
        view.isScrollEnabled = false
        view.textColor = UIColor(red: 0.133, green: 0.102, blue: 0.078, alpha: 1)
        view.onLayout = { [weak view] in
            guard let view else { return }
            context.coordinator.resize(view)
        }
        return view
    }

    func updateUIView(_ uiView: PhotoCaptionTextView, context: Context) {
        if uiView.text != text { uiView.text = text }
        context.coordinator.resize(uiView)
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UITextViewDelegate {
        var parent: PhotoMemoryGrowingField
        init(_ parent: PhotoMemoryGrowingField) { self.parent = parent }

        func textViewDidChange(_ textView: UITextView) {
            parent.text = textView.text
            resize(textView)
        }

        func resize(_ textView: UITextView) {
            let width = textView.bounds.width
            guard width > 1 else { return }
            let fit = textView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude)).height
            textView.isScrollEnabled = fit > 140
            let clamped = min(max(fit, 64), 140)
            guard abs(parent.measuredHeight - clamped) > 0.5 else { return }
            DispatchQueue.main.async { self.parent.measuredHeight = clamped }
        }
    }
}

final class PhotoCaptionTextView: UITextView {
    var onLayout: (() -> Void)?
    override func layoutSubviews() {
        super.layoutSubviews()
        onLayout?()
    }
}

struct PhotoMemoryDisplayView: View {
    let aspect: PhotoMemoryAspectRatio
    let image: UIImage?
    let caption: String
    @State private var contentWidth: CGFloat = 320

    private var outerWidth: CGFloat { max(contentWidth * aspect.displayWidthFraction, 1) }
    private var apertureWidth: CGFloat { max(outerWidth - (13 + 22) * 2, 1) }
    private var apertureHeight: CGFloat { apertureWidth / aspect.widthOverHeight }
    private var outerHeight: CGFloat { apertureHeight + (13 + 22) * 2 }

    var body: some View {
        VStack(spacing: 24) {
        ZStack(alignment: .bottom) {
            PhotoMemorySpotlightPair()
                .frame(width: outerWidth + 80, height: outerHeight + 80)
            PhotoMemoryFrame(image: image)
                .frame(width: outerWidth, height: outerHeight)
                .overlay(alignment: .top) {
                    HStack {
                        PhotoMemorySpotlight(facesRight: true)
                        Spacer(minLength: 0)
                        PhotoMemorySpotlight(facesRight: false)
                    }
                    .frame(width: outerWidth + 36)
                    .offset(y: -48)
                }
        }
        .frame(height: outerHeight + 60)
            PhotoMemoryCaptionCard(text: caption)
                .frame(width: contentWidth * 0.86)
        }
        .frame(maxWidth: .infinity)
        .background {
            GeometryReader { proxy in
                Color.clear.preference(key: PhotoMemoryWidthKey.self, value: proxy.size.width)
            }
        }
        .onPreferenceChange(PhotoMemoryWidthKey.self) { contentWidth = $0 }
    }
}

private struct PhotoMemoryWidthKey: PreferenceKey {
    static var defaultValue: CGFloat = 320
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        let next = nextValue()
        if next > 1 { value = next }
    }
}

struct PhotoMemoryCaptionCard: View {
    let text: String

    var body: some View {
        Text(text.isEmpty ? "一言を入力" : text)
            .font(.system(size: 17.5))
            .foregroundStyle(PhotoMemoryPalette.ink)
            .lineSpacing(6)
            .multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 23)
            .padding(.vertical, 21)
            .background(Color.white.opacity(0.94), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(PhotoMemoryPalette.border, lineWidth: 1))
            .shadow(color: PhotoMemoryPalette.ink.opacity(0.06), radius: 10, y: 4)
    }
}

struct PhotoMemoryFrame: View {
    let image: UIImage?

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [Color(red: 0.98, green: 0.96, blue: 0.93), PhotoMemoryPalette.moulding, Color(red: 0.90, green: 0.86, blue: 0.80)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
            RoundedRectangle(cornerRadius: 4, style: .continuous)
                .stroke(Color(red: 0.76, green: 0.68, blue: 0.56).opacity(0.7), lineWidth: 2)
                .padding(5)
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(PhotoMemoryPalette.mat)
                .padding(13)
            GeometryReader { geo in
                let apertureWidth = max(geo.size.width - (13 + 22) * 2, 1)
                let apertureHeight = max(geo.size.height - (13 + 22) * 2, 1)
                Group {
                    if let image {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFill()
                    } else {
                        PhotoMemoryPalette.mat
                    }
                }
                .frame(width: apertureWidth, height: apertureHeight)
                .clipped()
                .position(x: geo.size.width / 2, y: geo.size.height / 2)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        .shadow(color: Color(red: 0.25, green: 0.16, blue: 0.08).opacity(0.16), radius: 16, x: 3, y: 10)
        .overlay(alignment: .top) {
            LinearGradient(colors: [Color.white.opacity(0.5), Color.clear], startPoint: .top, endPoint: .bottom)
                .frame(height: 12)
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                .allowsHitTesting(false)
        }
    }
}

struct PhotoMemorySpotlightPair: View {
    var body: some View {
        ZStack {
            PhotoMemoryLightCone(fromLeft: true)
            PhotoMemoryLightCone(fromLeft: false)
        }
        .allowsHitTesting(false)
    }
}

private struct PhotoMemoryLightCone: View {
    let fromLeft: Bool

    var body: some View {
        Canvas { context, size in
            let origin = CGPoint(x: fromLeft ? size.width * 0.16 : size.width * 0.84, y: 18)
            let foot = CGPoint(x: size.width * 0.5, y: size.height * 0.72)
            var path = Path()
            path.move(to: origin)
            path.addQuadCurve(
                to: CGPoint(x: fromLeft ? size.width * 0.72 : size.width * 0.28, y: size.height * 0.78),
                control: CGPoint(x: fromLeft ? size.width * 0.58 : size.width * 0.42, y: size.height * 0.28)
            )
            path.addQuadCurve(
                to: origin,
                control: CGPoint(x: fromLeft ? size.width * 0.22 : size.width * 0.78, y: size.height * 0.48)
            )
            context.fill(
                path,
                with: .linearGradient(
                    Gradient(stops: [
                        .init(color: PhotoMemoryPalette.beam.opacity(0.62), location: 0),
                        .init(color: PhotoMemoryPalette.beam.opacity(0.22), location: 0.42),
                        .init(color: PhotoMemoryPalette.beam.opacity(0), location: 1)
                    ]),
                    startPoint: origin,
                    endPoint: foot
                )
            )
        }
        .blur(radius: 14)
    }
}

struct PhotoMemorySpotlight: View {
    let facesRight: Bool

    var body: some View {
        ZStack {
            Circle()
                .fill(
                    LinearGradient(
                        colors: [PhotoMemoryPalette.brassLight, PhotoMemoryPalette.brass, PhotoMemoryPalette.brassDark],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 21, height: 21)
                .shadow(color: PhotoMemoryPalette.brassDark.opacity(0.28), radius: 2, y: 1)
                .offset(y: -14)
            Capsule()
                .fill(
                    LinearGradient(colors: [PhotoMemoryPalette.brassLight, PhotoMemoryPalette.brass], startPoint: .leading, endPoint: .trailing)
                )
                .frame(width: 5, height: 16)
                .rotationEffect(.degrees(facesRight ? 34 : -34))
                .offset(x: facesRight ? 5 : -5, y: -1)
            PhotoMemoryLampHead()
                .fill(
                    LinearGradient(
                        colors: [PhotoMemoryPalette.brassLight, PhotoMemoryPalette.brass, PhotoMemoryPalette.brassDark],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
                .frame(width: 18, height: 13)
                .rotationEffect(.degrees(facesRight ? 42 : -42))
                .shadow(color: PhotoMemoryPalette.brassDark.opacity(0.25), radius: 2, y: 1)
                .offset(x: facesRight ? 9 : -9, y: 12)
        }
        .frame(width: 40, height: 46)
    }
}

private struct PhotoMemoryLampHead: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.minX + rect.width * 0.28, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX - rect.width * 0.28, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        path.closeSubpath()
        return path
    }
}

struct PlanningDiaryCard: View {
    let title: String
    let text: String

    private var displayTitle: String {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? PlanningText.string(.anythingDiary) : trimmed
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Spacer(minLength: 0)
                Image(systemName: "pencil.and.scribble")
                    .font(.system(size: 30, weight: .light))
                    .foregroundStyle(PlanningPalette.muted.opacity(0.75))
                    .frame(width: 48, height: 48)
            }
            .padding(.top, 18)
            .padding(.trailing, 21)
            PlanningDiaryTitle(text: displayTitle)
                .padding(.top, 2)
                .padding(.horizontal, 23)
            PlanningDiaryPaper(text: text)
                .padding(.top, 22)
                .padding(.horizontal, 23)
                .padding(.bottom, 20)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(red: 0.995, green: 0.985, blue: 0.965), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(PlanningPalette.line, lineWidth: 1))
    }
}

/// Title underlines follow each TextKit line fragment, so a wrap never draws through empty space.
struct PlanningDiaryTitle: UIViewRepresentable {
    let text: String

    func makeUIView(context: Context) -> DiaryTitleView {
        let view = DiaryTitleView()
        view.apply(text)
        return view
    }

    func updateUIView(_ uiView: DiaryTitleView, context: Context) {
        uiView.apply(text)
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: DiaryTitleView, context: Context) -> CGSize? {
        let width = proposal.width ?? UIScreen.main.bounds.width
        return CGSize(width: width, height: uiView.measuredHeight(for: width, text: text))
    }
}

final class DiaryTitleView: UIView {
    private let textView = DiaryTextKit.makeTextView()

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        isOpaque = false
        addSubview(textView)
    }

    required init?(coder: NSCoder) { nil }

    func apply(_ text: String) {
        let font = UIFont.systemFont(ofSize: 23, weight: .semibold)
        let style = NSMutableParagraphStyle()
        style.lineSpacing = 6
        let attributed = NSAttributedString(string: text, attributes: [
            .font: font,
            .foregroundColor: UIColor(red: 0.227, green: 0.184, blue: 0.145, alpha: 1),
            .paragraphStyle: style
        ])
        if textView.attributedText != attributed {
            textView.attributedText = attributed
        }
        setNeedsDisplay()
    }

    func measuredHeight(for width: CGFloat, text: String) -> CGFloat {
        apply(text)
        let fitted = textView.sizeThatFits(CGSize(width: max(width, 1), height: .greatestFiniteMagnitude)).height
        return fitted + 8
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        textView.frame = CGRect(x: 0, y: 0, width: bounds.width, height: max(bounds.height - 8, 1))
        textView.layoutIfNeeded()
        setNeedsDisplay()
    }

    override func draw(_ rect: CGRect) {
        guard let context = UIGraphicsGetCurrentContext() else { return }
        context.setStrokeColor(UIColor(red: 0.62, green: 0.48, blue: 0.28, alpha: 0.55).cgColor)
        context.setLineWidth(1.75)
        DiaryTextKit.enumerateLines(in: textView) { used in
            let y = used.maxY + 3
            context.move(to: CGPoint(x: used.minX, y: y))
            context.addLine(to: CGPoint(x: used.maxX, y: y))
        }
        context.strokePath()
    }
}

/// Body rules are drawn from the laid-out line fragments, not from a fixed pitch grid.
struct PlanningDiaryPaper: UIViewRepresentable {
    let text: String

    func makeUIView(context: Context) -> DiaryPaperView {
        let view = DiaryPaperView()
        view.apply(text)
        return view
    }

    func updateUIView(_ uiView: DiaryPaperView, context: Context) {
        uiView.apply(text)
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: DiaryPaperView, context: Context) -> CGSize? {
        let width = proposal.width ?? UIScreen.main.bounds.width
        return CGSize(width: width, height: uiView.measuredHeight(for: width, text: text))
    }
}

final class DiaryPaperView: UIView {
    private let textView = DiaryTextKit.makeTextView()
    private let lineBox: CGFloat = 28

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        isOpaque = false
        addSubview(textView)
    }

    required init?(coder: NSCoder) { nil }

    func apply(_ text: String) {
        let font = UIFont.systemFont(ofSize: 17)
        let style = NSMutableParagraphStyle()
        style.minimumLineHeight = lineBox
        style.maximumLineHeight = lineBox
        style.paragraphSpacing = 0
        let attributed = NSAttributedString(string: text, attributes: [
            .font: font,
            .foregroundColor: UIColor(red: 0.227, green: 0.184, blue: 0.145, alpha: 1),
            .paragraphStyle: style,
            .baselineOffset: max((lineBox - font.lineHeight) / 2, 0)
        ])
        if textView.attributedText != attributed {
            textView.attributedText = attributed
        }
        setNeedsDisplay()
    }

    func measuredHeight(for width: CGFloat, text: String) -> CGFloat {
        apply(text)
        return textView.sizeThatFits(CGSize(width: max(width, 1), height: .greatestFiniteMagnitude)).height
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        textView.frame = bounds
        textView.layoutIfNeeded()
        setNeedsDisplay()
    }

    override func draw(_ rect: CGRect) {
        guard let context = UIGraphicsGetCurrentContext() else { return }
        context.setStrokeColor(UIColor(red: 0.72, green: 0.64, blue: 0.52, alpha: 0.45).cgColor)
        context.setLineWidth(0.6)
        DiaryTextKit.enumerateLines(in: textView) { used in
            let y = min(used.maxY - 0.3, bounds.height - 0.3)
            context.move(to: CGPoint(x: 0, y: y))
            context.addLine(to: CGPoint(x: bounds.width, y: y))
        }
        context.strokePath()
    }
}

enum DiaryTextKit {
    static func makeTextView() -> UITextView {
        let storage = NSTextStorage()
        let manager = NSLayoutManager()
        let container = NSTextContainer(size: CGSize(width: 0, height: CGFloat.greatestFiniteMagnitude))
        container.lineFragmentPadding = 0
        container.widthTracksTextView = true
        storage.addLayoutManager(manager)
        manager.addTextContainer(container)
        let view = UITextView(frame: .zero, textContainer: container)
        view.isEditable = false
        view.isSelectable = false
        view.isScrollEnabled = false
        view.backgroundColor = .clear
        view.textContainerInset = .zero
        view.isUserInteractionEnabled = false
        view.isOpaque = false
        return view
    }

    static func enumerateLines(in textView: UITextView, body: @escaping (CGRect) -> Void) {
        let manager = textView.layoutManager
        manager.ensureLayout(for: textView.textContainer)
        let range = manager.glyphRange(for: textView.textContainer)
        manager.enumerateLineFragments(forGlyphRange: range) { _, usedRect, _, _, _ in
            guard usedRect.width > 0.5, usedRect.height > 0.5 else { return }
            body(usedRect.offsetBy(dx: textView.textContainerInset.left, dy: textView.textContainerInset.top))
        }
    }
}

struct SavedPeriodMemory: View {
    @ObservedObject var session: PlanningSession
    @EnvironmentObject private var navigation: TabNavigationState
    let entry: PlanningMemoryEntry
    let scope: ReflectionScope

    var body: some View {
        if entry.kind == .photoNote {
            Button { openEditor() } label: {
                PhotoMemoryDisplayView(
                    aspect: PhotoMemoryAspectRatio.restored(entry.photoAspect.rawValue),
                    image: entry.imageData.flatMap { UIImage(data: $0) },
                    caption: entry.text
                )
            }
            .buttonStyle(.plain)
        } else {
            Button { openEditor() } label: {
                PlanningDiaryCard(title: entry.title, text: entry.text)
            }
            .buttonStyle(.plain)
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
    @State private var captionHeight: CGFloat = 64
    @State private var editorWidth: CGFloat = 320

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
        return entry.kind == .photoNote ? "写真＆一言" : PlanningText.string(.anythingDiary)
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
        let latest = session.memoryEntries.first { $0.id == entry.id } ?? entry
        return VStack(alignment: .leading, spacing: 0) {
            Text("写真を１枚と、一言だけ残せます。")
                .font(.system(size: 16))
                .foregroundStyle(PhotoMemoryPalette.taupe)
            PhotoMemoryAspectPicker(selection: aspectBinding(latest))
                .padding(.top, 24)
            PhotosPicker(selection: $photo, matching: .images) {
                PhotoMemoryPickerCard(
                    aspect: latest.photoAspect,
                    image: latest.imageData.flatMap { UIImage(data: $0) },
                    contentWidth: editorWidth
                )
            }
            .buttonStyle(.plain)
            .padding(.top, 26)
            ZStack(alignment: .topLeading) {
                if latest.text.isEmpty {
                    Text("一言を入力")
                        .font(.system(size: 17))
                        .foregroundStyle(PhotoMemoryPalette.taupe.opacity(0.85))
                        .padding(.horizontal, 18)
                        .padding(.vertical, 16)
                        .allowsHitTesting(false)
                }
                PhotoMemoryGrowingField(text: memoryText(latest), measuredHeight: $captionHeight)
            }
            .frame(height: captionHeight)
            .background(Color.white.opacity(0.94), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(PhotoMemoryPalette.border, lineWidth: 1))
            .padding(.top, 22)
            Button {
                PlanningTransition.perform {
                    session.saveMemory(id: latest.id)
                    if !navigation.path.isEmpty { navigation.pop() }
                }
            } label: {
                Text("保存")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(Color.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 78)
                    .background(
                        LinearGradient(
                            colors: [Color(red: 0.93, green: 0.62, blue: 0.34), PhotoMemoryPalette.accent],
                            startPoint: .top,
                            endPoint: .bottom
                        ),
                        in: RoundedRectangle(cornerRadius: 31, style: .continuous)
                    )
            }
            .buttonStyle(.plain)
            .frame(width: editorWidth * 0.93)
            .frame(maxWidth: .infinity)
            .padding(.top, 22)
            .padding(.bottom, 24)
        }
        .padding(.horizontal, 32)
        .padding(.top, 8)
        .background {
            GeometryReader { proxy in
                Color.clear.preference(key: PhotoMemoryWidthKey.self, value: proxy.size.width - 64)
            }
        }
        .onPreferenceChange(PhotoMemoryWidthKey.self) { editorWidth = $0 }
        .onChange(of: photo) { _, item in
            Task {
                let data = try? await item?.loadTransferable(type: Data.self)
                let current = session.memoryEntries.first { $0.id == entry.id } ?? entry
                session.updateMemory(id: entry.id, text: current.text, title: current.title, dateText: current.dateText, hasPhoto: data != nil, imageData: data, photoAspect: current.photoAspect)
            }
        }
    }

    private func aspectBinding(_ entry: PlanningMemoryEntry) -> Binding<PhotoMemoryAspectRatio> {
        Binding(
            get: { session.memoryEntries.first { $0.id == entry.id }?.photoAspect ?? entry.photoAspect },
            set: { value in
                let current = session.memoryEntries.first { $0.id == entry.id } ?? entry
                session.updateMemory(id: entry.id, text: current.text, title: current.title, dateText: current.dateText, hasPhoto: current.hasPhoto, imageData: current.imageData, photoAspect: value)
            }
        )
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
