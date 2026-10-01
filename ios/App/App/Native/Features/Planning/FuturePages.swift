import SwiftUI

struct FutureYearPage: View {
    @ObservedObject var session: PlanningSession
    @EnvironmentObject private var navigation: TabNavigationState
    @State private var showingYearPicker = false
    @State private var selectedMonth: Int?

    var body: some View {
        let year = session.yearModel()
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 12) {
                    PlanningGlyph(section: .future)
                    Button {
                        session.shiftYear(by: -1)
                    } label: {
                        Image(systemName: "chevron.left")
                            .frame(width: 44, height: 44)
                    }
                    Button {
                        showingYearPicker = true
                    } label: {
                        Text(String(session.selectedYear))
                            .font(.title2.bold())
                            .frame(minWidth: 72, minHeight: 44)
                    }
                    Button {
                        session.shiftYear(by: 1)
                    } label: {
                        Image(systemName: "chevron.right")
                            .frame(width: 44, height: 44)
                    }
                    Spacer()
                }
                .buttonStyle(.plain)
                let futureScope = ReflectionScope.future(session.selectedYear)
                if session.futureReflections.first(where: { $0.year == session.selectedYear })?.reflectionCompleted == true {
                    ReflectionResultView(session: session, scope: futureScope)
                } else if session.isActivePrompt(futureScope) {
                    Button("振り返りを始めますか？") {
                        session.refreshDue(futureScope)
                        navigation.path.append(PlanningRoute.reflection(futureScope))
                    }
                    .buttonStyle(.borderedProminent)
                }
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                    ForEach(year.months) { month in
                        Button {
                            selectedMonth = month.month
                        } label: {
                            FutureMonthCell(
                                year: session.selectedYear,
                                month: month,
                                events: session.events.filter {
                                    $0.year == session.selectedYear && $0.month == month.month
                                }
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(16)
        }
        .gesture(
            DragGesture(minimumDistance: 24)
                .onEnded { value in
                    if value.translation.width <= -40 {
                        session.shiftYear(by: 1)
                    } else if value.translation.width >= 40 {
                        session.shiftYear(by: -1)
                    }
                }
        )
        .nativeSheet(isPresented: $showingYearPicker, detents: [.medium]) {
            YearPickerSheet(year: session.selectedYear) { picked in
                session.selectedYear = picked
                if !session.years.contains(where: { $0.year == picked }) {
                    session.years.append(PlanningRules.makeYear(picked))
                }
                showingYearPicker = false
            } onClose: {
                showingYearPicker = false
            }
        }
        .nativeSheet(
            isPresented: Binding(
                get: { selectedMonth != nil },
                set: { if !$0 { selectedMonth = nil } }
            ),
            detents: [.large]
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
}

private struct FutureMonthCell: View {
    let year: Int
    let month: FutureMonthModel
    let events: [PlanningEventRecord]

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(monthTitle)
                .font(.caption.weight(.semibold))
            if !month.goal.isEmpty {
                Text(month.goal)
                    .font(.caption2)
                    .lineLimit(1)
            }
            let days = daysInMonth()
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 1), count: 7), spacing: 1) {
                ForEach(days, id: \.self) { day in
                    Text("\(day)")
                        .font(.system(size: 8))
                        .frame(maxWidth: .infinity)
                        .background(events.contains { $0.startDay == day } ? Color.accentColor.opacity(0.35) : Color.clear)
                }
            }
        }
        .padding(8)
        .frame(maxWidth: .infinity, minHeight: 92, alignment: .topLeading)
        .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
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

    private func daysInMonth() -> [Int] {
        var components = DateComponents()
        components.year = year
        components.month = month.month
        let calendar = Calendar(identifier: .gregorian)
        let date = calendar.date(from: components) ?? Date()
        let count = calendar.range(of: .day, in: .month, for: date)?.count ?? 30
        return Array(1...count)
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
        NativeSheetScaffold(title: "Year", onClose: onClose, onConfirm: { onPick(picked) }) {
            Picker("Year", selection: $picked) {
                ForEach((year - 5)...(year + 5), id: \.self) { value in
                    Text(String(value)).tag(value)
                }
            }
            .pickerStyle(.wheel)
        }
    }
}

struct FutureMonthSheet: View {
    @ObservedObject var session: PlanningSession
    let year: Int
    let month: Int
    let onClose: () -> Void

    @State private var goal = ""
    @State private var outlook: [String] = []
    @State private var outlookDraft = ""
    @State private var selectedDay = 1
    @State private var eventTitle = ""
    @State private var endDay = 1
    @State private var includesTime = false
    @State private var minutes = 9 * 60

    var body: some View {
        NativeSheetScaffold(title: LocalizedStringKey(monthTitle), onClose: onClose, onConfirm: saveGoal) {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text("月の目標")
                        .font(.headline)
                    TextField("目標は1つ", text: $goal)
                        .textFieldStyle(.roundedBorder)
                    Text("予定")
                        .font(.headline)
                    dayGrid
                    TextField("タイトル", text: $eventTitle)
                        .textFieldStyle(.roundedBorder)
                    Stepper("開始 \(selectedDay)", value: $selectedDay, in: 1...dayCount)
                    Stepper("終了 \(endDay)", value: $endDay, in: selectedDay...dayCount)
                    Toggle("時間を入れる", isOn: $includesTime)
                    if includesTime {
                        Stepper(timeLabel, value: $minutes, in: 0...(23 * 60 + 59), step: 15)
                    }
                    Button("予定を追加") { addEvent() }
                        .buttonStyle(.borderedProminent)
                    Text("見通し")
                        .font(.headline)
                    ForEach(outlook.indices, id: \.self) { index in
                        Text("・\(outlook[index])")
                    }
                    HStack {
                        TextField("見通し", text: $outlookDraft)
                            .textFieldStyle(.roundedBorder)
                        Button("追加") {
                            let text = outlookDraft.trimmingCharacters(in: .whitespacesAndNewlines)
                            guard !text.isEmpty else { return }
                            outlook.append(text)
                            outlookDraft = ""
                        }
                    }
                }
                .padding(16)
            }
        }
        .onAppear(perform: load)
    }

    private var dayCount: Int {
        var components = DateComponents()
        components.year = year
        components.month = month
        let calendar = Calendar(identifier: .gregorian)
        let date = calendar.date(from: components) ?? Date()
        return calendar.range(of: .day, in: .month, for: date)?.count ?? 30
    }

    private var monthTitle: String {
        var components = DateComponents()
        components.year = year
        components.month = month
        components.day = 1
        let date = Calendar(identifier: .gregorian).date(from: components) ?? Date()
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ja_JP")
        formatter.dateFormat = "M月"
        return formatter.string(from: date)
    }

    private var timeLabel: String {
        String(format: "%02d:%02d", minutes / 60, minutes % 60)
    }

    private var dayGrid: some View {
        let marked = Set(session.events.filter { $0.year == year && $0.month == month }.map(\.startDay))
        return LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 7), spacing: 6) {
            ForEach(1...dayCount, id: \.self) { day in
                Button {
                    selectedDay = day
                    endDay = max(endDay, day)
                } label: {
                    Text("\(day)")
                        .frame(maxWidth: .infinity, minHeight: 32)
                        .background(marked.contains(day) ? Color.accentColor.opacity(0.35) : Color.clear, in: Circle())
                        .overlay(Circle().stroke(selectedDay == day ? Color.primary : Color.clear, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func load() {
        let model = session.yearModel()
        if let monthModel = model.months.first(where: { $0.month == month }) {
            goal = monthModel.goal
            outlook = monthModel.outlook
        }
        selectedDay = min(selectedDay, dayCount)
        endDay = min(max(endDay, selectedDay), dayCount)
    }

    private func saveGoal() {
        var model = session.yearModel()
        guard let index = model.months.firstIndex(where: { $0.month == month }) else { return }
        model.months[index].goal = goal
        model.months[index].outlook = outlook
        session.updateYear(model)
        onClose()
    }

    private func addEvent() {
        let title = eventTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return }
        session.addEvent(
            PlanningEventRecord(
                title: title,
                year: year,
                month: month,
                startDay: selectedDay,
                endDay: endDay == selectedDay ? nil : endDay,
                timeMinutes: includesTime ? minutes : nil
            )
        )
        eventTitle = ""
    }
}
