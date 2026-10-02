import SwiftUI

struct FutureYearPage: View {
    @ObservedObject var session: PlanningSession
    @EnvironmentObject private var navigation: TabNavigationState
    @State private var showingYearPicker = false
    @State private var selectedMonth: Int?

    private let pageYears = Array(2020...2036)

    var body: some View {
        TabView(selection: $session.selectedYear) {
            ForEach(pageYears, id: \.self) { year in
                yearPage(year)
                    .tag(year)
            }
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .onChange(of: session.selectedYear) { _, _ in
            session.ensureSelectedYear()
        }
        .sheet(isPresented: $showingYearPicker) {
            YearPickerSheet(year: session.selectedYear) { picked in
                session.selectedYear = picked
                session.ensureSelectedYear()
                showingYearPicker = false
            } onClose: {
                showingYearPicker = false
            }
        }
        .sheet(
            isPresented: Binding(
                get: { selectedMonth != nil },
                set: { if !$0 { selectedMonth = nil } }
            )
        ) {
            if let selectedMonth {
                FutureMonthSheet(
                    session: session,
                    year: session.selectedYear,
                    month: selectedMonth,
                    onClose: { self.selectedMonth = nil }
                )
            }
        }
    }

    private func yearPage(_ year: Int) -> some View {
        let model = session.years.first(where: { $0.year == year }) ?? PlanningRules.makeYear(year)
        return ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 8) {
                    PlanningHeadingIconSlot()
                    Button { session.shiftYear(by: -1) } label: {
                        Image(systemName: "chevron.left").frame(width: 44, height: 44)
                    }
                    Button { showingYearPicker = true } label: {
                        Text(String(year))
                            .font(.title2.bold())
                            .foregroundStyle(PlanningPalette.ink)
                            .frame(minWidth: 72, minHeight: 44)
                    }
                    Button { session.shiftYear(by: 1) } label: {
                        Image(systemName: "chevron.right").frame(width: 44, height: 44)
                    }
                    Spacer()
                }
                .buttonStyle(.plain)
                let futureScope = ReflectionScope.future(year)
                if session.futureReflections.first(where: { $0.year == year })?.reflectionCompleted == true {
                    ReflectionResultView(session: session, scope: futureScope)
                } else if year == session.selectedYear, session.isActivePrompt(futureScope) {
                    Button("振り返りを始めますか？") {
                        session.refreshDue(futureScope)
                        navigation.path.append(PlanningRoute.reflection(futureScope))
                    }
                    .buttonStyle(.borderedProminent)
                }
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                    ForEach(model.months) { month in
                        Button { selectedMonth = month.month } label: {
                            FutureMonthCell(
                                year: year,
                                month: month,
                                events: session.events.filter { $0.year == year && $0.month == month.month }
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(16)
        }
        .planningScroll()
        .background(PlanningPalette.paper)
    }
}

private struct FutureMonthCell: View {
    let year: Int
    let month: FutureMonthModel
    let events: [PlanningEventRecord]

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(monthTitle)
                .font(.caption.weight(.semibold))
                .foregroundStyle(PlanningPalette.ink)
            if !month.goal.isEmpty {
                Text(month.goal)
                    .font(.caption2)
                    .foregroundStyle(PlanningPalette.muted)
                    .lineLimit(1)
            }
            let rows = PlanningCalendarGrid.matrix(year: year, month: month.month)
            VStack(spacing: 1) {
                ForEach(0..<PlanningCalendarGrid.rowCount, id: \.self) { row in
                    HStack(spacing: 1) {
                        ForEach(0..<PlanningCalendarGrid.columnCount, id: \.self) { column in
                            let day = rows[row][column]
                            Text(day.map(String.init) ?? " ")
                                .font(.system(size: 8))
                                .foregroundStyle(PlanningPalette.ink)
                                .frame(maxWidth: .infinity, minHeight: 11)
                                .background(day != nil && events.contains { $0.startDay == day } ? PlanningPalette.future : Color.clear)
                        }
                    }
                }
            }
        }
        .padding(8)
        .frame(maxWidth: .infinity, minHeight: 132, maxHeight: 132, alignment: .topLeading)
        .background(PlanningPalette.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(PlanningPalette.line, lineWidth: 1))
    }

    private var monthTitle: String {
        var components = DateComponents()
        components.month = month.month
        components.day = 1
        let date = Calendar(identifier: .gregorian).date(from: components) ?? Date()
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "MMM"
        return formatter.string(from: date)
    }
}

private struct YearPickerSheet: View {
    let year: Int
    let onPick: (Int) -> Void
    let onClose: () -> Void
    @State private var picked: Int

    init(year: Int, onPick: @escaping (Int) -> Void, onClose: @escaping () -> Void) {
        self.year = year
        self.onPick = onPick
        self.onClose = onClose
        _picked = State(initialValue: year)
    }

    var body: some View {
        PlanningSheetChrome(onClose: onClose, onConfirm: { onPick(picked) }, fixedHeight: 260) {
            Picker("Year", selection: $picked) {
                ForEach((year - 5)...(year + 5), id: \.self) { value in
                    Text(String(value)).tag(value)
                }
            }
            .pickerStyle(.wheel)
            .labelsHidden()
        }
    }
}

private struct FutureEventDraft: Identifiable, Equatable {
    var id: UUID
    var title: String
    var startDay: Int
    var startMinutes: Int?
    var endDay: Int
    var endMinutes: Int?
    var iconSymbol: String = "calendar"
    var colorID: String = "lilac"
}

struct FutureMonthSheet: View {
    @ObservedObject var session: PlanningSession
    let year: Int
    let month: Int
    let onClose: () -> Void

    @State private var goal = ""
    @State private var drafts: [FutureEventDraft] = []
    @State private var originalGoal = ""
    @State private var originalDrafts: [FutureEventDraft] = []
    @State private var confirmDiscard = false
    @State private var eventTitle = ""
    @State private var startDay = 1
    @State private var endDay = 1
    @State private var includesStartTime = false
    @State private var includesEndTime = false
    @State private var startMinutes = 9 * 60
    @State private var endMinutes = 10 * 60
    @State private var showingSharedEditor = false

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                NativeGlassIconButton(icon: .close, accessibilityLabel: "Close", action: requestClose)
                Spacer()
                NativeGlassIconButton(icon: .check, accessibilityLabel: "Save", prominent: true, action: save)
            }
            .padding(.horizontal, 16)
            .padding(.top, 10)
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text("月の目標")
                        .font(.headline)
                        .foregroundStyle(PlanningPalette.ink)
                    TextField("目標は1つ", text: $goal)
                        .textFieldStyle(.roundedBorder)
                    ForEach(drafts) { draft in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(draft.title)
                                .font(.body.weight(.semibold))
                                .foregroundStyle(PlanningPalette.ink)
                            Text(rangeText(draft))
                                .font(.caption)
                                .foregroundStyle(PlanningPalette.muted)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .background(PlanningPalette.event, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                    TextField("内容", text: $eventTitle)
                        .textFieldStyle(.roundedBorder)
                    Stepper("開始日 \(startDay)", value: $startDay, in: 1...dayCount)
                    Toggle("開始時刻", isOn: $includesStartTime)
                    if includesStartTime {
                        Stepper(clock(startMinutes), value: $startMinutes, in: 0...(23 * 60 + 59), step: 15)
                    }
                    Stepper("終了日 \(endDay)", value: $endDay, in: startDay...dayCount)
                    Toggle("終了時刻", isOn: $includesEndTime)
                    if includesEndTime {
                        Stepper(clock(endMinutes), value: $endMinutes, in: 0...(23 * 60 + 59), step: 15)
                    }
                    Button("予定を追加") { showingSharedEditor = true }
                        .buttonStyle(.bordered)
                }
                .padding(16)
            }
            .planningScroll()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(PlanningPalette.paper)
        .presentationDetents([.large])
        .presentationDragIndicator(.hidden)
        .interactiveDismissDisabled(isDirty)
        .presentationBackground(PlanningPalette.paper)
        .planningKeyboardDismiss()
        .onAppear(perform: load)
        .sheet(isPresented: $showingSharedEditor) {
            PlanningItemEditorSheet(
                draft: PlanningItemDraft(),
                bucket: .monthly,
                kind: .event,
                periodKey: String(format: "%04d-%02d", year, month)
            ) { draft in
                drafts.append(
                    FutureEventDraft(
                        id: UUID(),
                        title: draft.title,
                        startDay: draft.startDay ?? 1,
                        startMinutes: draft.startMinutes,
                        endDay: draft.endDay ?? draft.startDay ?? 1,
                        endMinutes: draft.endMinutes,
                        iconSymbol: draft.iconSymbol,
                        colorID: draft.colorID
                    )
                )
                showingSharedEditor = false
            } onClose: { showingSharedEditor = false }
        }
        .confirmationDialog("この変更を破棄しますか？", isPresented: $confirmDiscard, titleVisibility: .visible) {
            Button("破棄", role: .destructive) { onClose() }
            Button("キャンセル", role: .cancel) {}
        }
    }

    private var dayCount: Int {
        var components = DateComponents()
        components.year = year
        components.month = month
        let calendar = Calendar(identifier: .gregorian)
        let date = calendar.date(from: components) ?? Date()
        return calendar.range(of: .day, in: .month, for: date)?.count ?? 30
    }

    private func clock(_ minutes: Int) -> String {
        String(format: "%02d:%02d", minutes / 60, minutes % 60)
    }

    private func rangeText(_ draft: FutureEventDraft) -> String {
        var start = "\(draft.startDay)日"
        if let startMinutes = draft.startMinutes { start += " \(clock(startMinutes))" }
        var end = "\(draft.endDay)日"
        if let endMinutes = draft.endMinutes { end += " \(clock(endMinutes))" }
        return "\(start)～\(end)"
    }

    private func load() {
        let model = session.years.first(where: { $0.year == year }) ?? session.yearModel()
        goal = model.months.first(where: { $0.month == month })?.goal ?? ""
        drafts = session.events.filter { $0.year == year && $0.month == month }.map {
                FutureEventDraft(
                id: $0.id,
                title: $0.title,
                startDay: $0.startDay,
                startMinutes: $0.timeMinutes,
                endDay: $0.endDay ?? $0.startDay,
                endMinutes: $0.endTimeMinutes,
                iconSymbol: $0.iconSymbol,
                colorID: $0.colorID
            )
        }
        originalGoal = goal
        originalDrafts = drafts
    }

    private var isDirty: Bool {
        goal != originalGoal || drafts != originalDrafts
    }

    private func requestClose() {
        if isDirty { confirmDiscard = true } else { onClose() }
    }

    private func save() {
        var model = session.years.first(where: { $0.year == year }) ?? PlanningRules.makeYear(year)
        if let index = model.months.firstIndex(where: { $0.month == month }) {
            model.months[index].goal = goal
        }
        session.updateYear(model)
        session.events.removeAll { $0.year == year && $0.month == month }
        for draft in drafts where !draft.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            session.events.append(
                PlanningEventRecord(
                    id: draft.id,
                    title: draft.title,
                    year: year,
                    month: month,
                    startDay: draft.startDay,
                    endDay: draft.endDay == draft.startDay ? nil : draft.endDay,
                    timeMinutes: draft.startMinutes,
                    endTimeMinutes: draft.endMinutes,
                    iconSymbol: draft.iconSymbol,
                    colorID: draft.colorID
                )
            )
        }
        onClose()
    }

    private func addDraft() {
        let title = eventTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return }
        drafts.append(
            FutureEventDraft(
                id: UUID(),
                title: title,
                startDay: startDay,
                startMinutes: includesStartTime ? startMinutes : nil,
                endDay: endDay,
                endMinutes: includesEndTime ? endMinutes : nil
            )
        )
        eventTitle = ""
    }
}
