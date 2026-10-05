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
            VStack(alignment: .leading, spacing: 0) {
                PlanningSectionIntro(title: "Future", message: PlanningText.string(.futureDescription)) {
                    Image(systemName: "calendar")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(PlanningPalette.ink)
                        .frame(width: PlanningTokens.PlanMain.iconSlot, height: PlanningTokens.PlanMain.iconSlot)
                }

                yearControls(year)
                    .padding(.top, PlanningTokens.Future.yearGap)

                let futureScope = ReflectionScope.future(year)
                if session.futureReflections.first(where: { $0.year == year })?.reflectionCompleted == true {
                    ReflectionResultView(session: session, scope: futureScope)
                        .padding(.top, 12)
                } else if year == session.selectedYear, session.isActivePrompt(futureScope) {
                    Button("振り返りを始めますか？") {
                        session.refreshDue(futureScope)
                        navigation.path.append(PlanningRoute.reflection(futureScope))
                    }
                    .buttonStyle(.borderedProminent)
                    .padding(.top, 12)
                }

                LazyVGrid(
                    columns: Array(repeating: GridItem(.flexible(), spacing: PlanningTokens.Future.columnGap), count: 3),
                    spacing: PlanningTokens.Future.rowGap
                ) {
                    ForEach(model.months) { month in
                        Button { selectedMonth = month.month } label: {
                            FutureMonthCell(
                                year: year,
                                month: month.month,
                                events: session.events.filter { FutureEventOrder.belongs($0, year: year, month: month.month) }
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.top, 16)
            }
            .padding(.leading, PlanningTokens.contentInset)
            .padding(.trailing, PlanningTokens.Future.trailingInset)
            .padding(.bottom, 12)
        }
        .planningScroll()
        .background(PlanningPalette.paper)
    }

    private func yearControls(_ year: Int) -> some View {
        HStack(spacing: 4) {
            Button { session.shiftYear(by: -1) } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(PlanningPalette.ink)
                    .frame(width: 44, height: 44)
            }
            Button { showingYearPicker = true } label: {
                Text(FutureYearText.label(year))
                    .font(.title3.bold())
                    .foregroundStyle(PlanningPalette.ink)
                    .frame(minWidth: 88, minHeight: 44)
            }
            Button { session.shiftYear(by: 1) } label: {
                Image(systemName: "chevron.right")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(PlanningPalette.ink)
                    .frame(width: 44, height: 44)
            }
            Spacer(minLength: 0)
        }
        .buttonStyle(.plain)
    }
}

enum FutureYearText {
    static func label(_ year: Int) -> String {
        "\(year)年"
    }
}

enum FutureEventOrder {
    /// One record can intersect more than one month. This does not copy it.
    static func belongs(_ event: PlanningEventRecord, year: Int, month: Int) -> Bool {
        guard let startDay = event.startDay else {
            return event.year == year && event.month == month
        }
        let start = FutureEventValidation.stamp(year: event.year, month: event.month, day: startDay, minutes: nil)
        let end = FutureEventValidation.stamp(
            year: event.endYear ?? event.year,
            month: event.endMonth ?? event.month,
            day: event.endDay ?? startDay,
            minutes: nil
        )
        let first = FutureEventValidation.stamp(year: year, month: month, day: 1, minutes: nil)
        let last = FutureEventValidation.stamp(year: year, month: month, day: 31, minutes: nil)
        return start <= last && end >= first
    }

    /// Dated events first, by day then time. Undated events stay after them.
    static func chronological(_ events: [PlanningEventRecord]) -> [PlanningEventRecord] {
        events.sorted { lhs, rhs in
            switch (lhs.startDay, rhs.startDay) {
            case (nil, nil):
                return lhs.title < rhs.title
            case (nil, _):
                return false
            case (_, nil):
                return true
            case let (left?, right?):
                let earlier = FutureEventValidation.stamp(year: lhs.year, month: lhs.month, day: left, minutes: lhs.timeMinutes)
                let later = FutureEventValidation.stamp(year: rhs.year, month: rhs.month, day: right, minutes: rhs.timeMinutes)
                return earlier < later
            }
        }
    }
}

enum FutureEventValidation {
    /// Local calendar order. Missing minutes do not make a same-day range invalid.
    static func stamp(year: Int, month: Int, day: Int, minutes: Int?) -> Int {
        year * 1_000_000 + month * 10_000 + day * 100 + (minutes ?? 0)
    }

    static func isOrdered(
        startYear: Int, startMonth: Int, startDay: Int, startMinutes: Int?,
        endYear: Int, endMonth: Int, endDay: Int, endMinutes: Int?
    ) -> Bool {
        let startDate = stamp(year: startYear, month: startMonth, day: startDay, minutes: nil)
        let endDate = stamp(year: endYear, month: endMonth, day: endDay, minutes: nil)
        if endDate > startDate { return true }
        if endDate < startDate { return false }
        guard let startMinutes, let endMinutes else { return true }
        return endMinutes >= startMinutes
    }

    static func accepts(
        title: String,
        startYear: Int,
        startMonth: Int,
        startDay: Int?,
        startMinutes: Int?,
        endYear: Int?,
        endMonth: Int?,
        endDay: Int?,
        endMinutes: Int?
    ) -> Bool {
        guard !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        guard let startDay, let endDay else { return true }
        return isOrdered(
            startYear: startYear, startMonth: startMonth, startDay: startDay, startMinutes: startMinutes,
            endYear: endYear ?? startYear, endMonth: endMonth ?? startMonth, endDay: endDay, endMinutes: endMinutes
        )
    }
}

enum FutureEventText {
    static func range(
        year: Int, month: Int, startDay: Int?, startMinutes: Int?,
        endYear: Int? = nil, endMonth: Int? = nil, endDay: Int?, endMinutes: Int?
    ) -> String {
        guard let startDay else { return "" }
        let resolvedEndYear = endYear ?? year
        let crossesYear = endDay != nil && resolvedEndYear != year
        var start = crossesYear ? "\(year)年\(month)月\(startDay)日" : "\(month)月\(startDay)日"
        if let startMinutes { start += " \(clock(startMinutes))" }
        guard let endDay else { return start }
        let shownEndMonth = endMonth ?? month
        let sameMoment = !crossesYear && shownEndMonth == month && endDay == startDay && endMinutes == nil
        guard !sameMoment else { return start }
        var end = (!crossesYear && shownEndMonth == month && endDay == startDay) ? "" : "\(crossesYear ? "\(resolvedEndYear)年" : "")\(shownEndMonth)月\(endDay)日"
        if let endMinutes {
            end += end.isEmpty ? clock(endMinutes) : " \(clock(endMinutes))"
        }
        guard !end.isEmpty else { return start }
        return "\(start)～\(end)"
    }

    private static func clock(_ minutes: Int) -> String {
        String(format: "%02d:%02d", minutes / 60, minutes % 60)
    }
}

/// Mini-calendar marks. Repository order is creation order: the first covering event wins.
enum FutureCalendarMarks {
    enum BandRole {
        case leading, middle, trailing, both
    }

    static func dayStamp(year: Int, month: Int, day: Int) -> Int {
        year * 10_000 + month * 100 + day
    }

    static func interval(_ event: PlanningEventRecord) -> (start: Int, end: Int)? {
        guard let startDay = event.startDay else { return nil }
        let start = dayStamp(year: event.year, month: event.month, day: startDay)
        let end = dayStamp(
            year: event.endYear ?? event.year,
            month: event.endMonth ?? event.month,
            day: event.endDay ?? startDay
        )
        return (min(start, end), max(start, end))
    }

    static func covers(_ event: PlanningEventRecord, year: Int, month: Int, day: Int) -> Bool {
        guard let interval = interval(event) else { return false }
        let day = dayStamp(year: year, month: month, day: day)
        return interval.start <= day && day <= interval.end
    }

    static func isRange(_ event: PlanningEventRecord) -> Bool {
        guard let interval = interval(event) else { return false }
        return interval.end > interval.start
    }

    /// First event in repository order that covers the day.
    static func winner(_ events: [PlanningEventRecord], year: Int, month: Int, day: Int) -> PlanningEventRecord? {
        events.first { covers($0, year: year, month: month, day: day) }
    }

    /// Caps are per week row. A range that continues past Sunday starts again on Monday.
    static func bandRole(column: Int, eventID: UUID?, rowWinners: [UUID?]) -> BandRole? {
        guard let eventID, rowWinners[column] == eventID else { return nil }
        let previous = column > 0 ? rowWinners[column - 1] : nil
        let next = column < rowWinners.count - 1 ? rowWinners[column + 1] : nil
        let starts = previous != eventID
        let ends = next != eventID
        if starts && ends { return .both }
        if starts { return .leading }
        if ends { return .trailing }
        return .middle
    }
}

private struct FutureMonthCell: View {
    let year: Int
    let month: Int
    let events: [PlanningEventRecord]

    private var weekdays: [String] {
        let symbols = PeriodCalendar.calendar.veryShortWeekdaySymbols
        let first = PeriodCalendar.calendar.firstWeekday - 1
        return (0..<7).map { symbols[(first + $0) % 7] }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("\(month)月")
                .font(.system(size: PlanningTokens.Future.monthFont, weight: .semibold))
                .foregroundStyle(PlanningPalette.ink)
            HStack(spacing: 0) {
                ForEach(weekdays, id: \.self) { symbol in
                    Text(symbol)
                        .font(.system(size: PlanningTokens.Future.weekdayFont))
                        .foregroundStyle(PlanningPalette.muted)
                        .frame(maxWidth: .infinity)
                }
            }
            let rows = PlanningCalendarGrid.matrix(year: year, month: month)
            VStack(spacing: 2) {
                ForEach(0..<PlanningCalendarGrid.rowCount, id: \.self) { row in
                    let winners: [UUID?] = (0..<PlanningCalendarGrid.columnCount).map { column in
                        guard let day = rows[row][column] else { return nil }
                        return FutureCalendarMarks.winner(events, year: year, month: month, day: day)?.id
                    }
                    HStack(spacing: 0) {
                        ForEach(0..<PlanningCalendarGrid.columnCount, id: \.self) { column in
                            dayCell(day: rows[row][column], column: column, winners: winners)
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 6)
        .padding(.top, 8)
        .padding(.bottom, 8)
        .frame(maxWidth: .infinity)
        .frame(height: PlanningTokens.Future.cardHeight)
        .background(PlanningPalette.card, in: RoundedRectangle(cornerRadius: PlanningTokens.Future.cardRadius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: PlanningTokens.Future.cardRadius, style: .continuous)
                .stroke(PlanningPalette.line, lineWidth: 1)
        )
    }

    private func dayCell(day: Int?, column: Int, winners: [UUID?]) -> some View {
        let event = day.flatMap { FutureCalendarMarks.winner(events, year: year, month: month, day: $0) }
        let role = FutureCalendarMarks.bandRole(column: column, eventID: event?.id, rowWinners: winners)
        return ZStack {
            if let event, let role {
                FutureRangeBand(role: role)
                    .fill(PlanIconColor.resolved(event.colorID).color.opacity(0.26))
                    .padding(.vertical, 1)
            }
            Text(day.map(String.init) ?? " ")
                .font(.system(size: PlanningTokens.Future.dateFont))
                .foregroundStyle(PlanningPalette.ink)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct FutureRangeBand: Shape {
    let role: FutureCalendarMarks.BandRole

    func path(in rect: CGRect) -> Path {
        let leading = role == .leading || role == .both
        let trailing = role == .trailing || role == .both
        let radius = min(rect.height / 2, 4)
        return Path(
            roundedRect: rect,
            cornerRadii: RectangleCornerRadii(
                topLeading: leading ? radius : 0,
                bottomLeading: leading ? radius : 0,
                bottomTrailing: trailing ? radius : 0,
                topTrailing: trailing ? radius : 0
            )
        )
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

private struct FutureEventRoute: Identifiable {
    let id: UUID
}

struct FutureMonthSheet: View {
    @ObservedObject var session: PlanningSession
    let year: Int
    let month: Int
    let onClose: () -> Void

    @State private var goal = ""
    @State private var originalGoal = ""
    @State private var editingEventID: FutureEventRoute?

    private var events: [PlanningEventRecord] {
        FutureEventOrder.chronological(session.events.filter { FutureEventOrder.belongs($0, year: year, month: month) })
    }

    private var isDirty: Bool { goal != originalGoal }

    var body: some View {
        PlanningSystemSheetChrome(
            onClose: requestClose,
            onConfirm: save,
            showsControls: editingEventID == nil,
            maximumBody: PlanningTokens.Sheet.maximumBody
        ) {
            VStack(alignment: .leading, spacing: PlanningTokens.Future.sheetTopGap) {
                    Text(PlanningText.string(.monthGoal))
                        .font(.system(size: 15, weight: .semibold))
                    TextField("目標は1つ", text: $goal)
                        .lineLimit(1)
                        .padding(.horizontal, 12)
                        .frame(height: PlanningTokens.Editor.fieldHeight)
                        .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    HStack {
                        Text(PlanningText.string(.monthEvents))
                            .font(.system(size: 15, weight: .semibold))
                        Spacer()
                        Button {
                            editingEventID = FutureEventRoute(id: UUID())
                        } label: {
                            Image(systemName: "plus")
                                .font(.system(size: 17, weight: .semibold))
                                .frame(width: 44, height: 44)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(PlanningText.string(.addEvent))
                    }
                    if events.isEmpty {
                        Text(PlanningText.string(.noEvents))
                            .font(.system(size: 15))
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 8)
                    } else {
                        ForEach(events) { event in
                            Button {
                                editingEventID = FutureEventRoute(id: event.id)
                            } label: {
                                eventRow(event)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(.horizontal, PlanningTokens.contentInset)
                .padding(.top, PlanningTokens.Sheet.sectionSpacing)
                .padding(.bottom, 8)
        }
        .interactiveDismissDisabled(isDirty)
        .onAppear(perform: load)
        .sheet(item: $editingEventID) { route in
            FutureEventSheet(
                session: session,
                year: year,
                month: month,
                existing: session.events.first { $0.id == route.id }
            )
        }
    }

    private func eventRow(_ event: PlanningEventRecord) -> some View {
        HStack(alignment: .center, spacing: 12) {
            Image(systemName: PlanIconCatalog.symbol(for: event.iconSymbol) ?? "calendar")
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(PlanIconColor.resolved(event.colorID).color)
                .frame(width: 36, height: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(event.title)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                let range = FutureEventText.range(
                    year: event.year,
                    month: event.month,
                    startDay: event.startDay,
                    startMinutes: event.timeMinutes,
                    endYear: event.endYear,
                    endMonth: event.endMonth,
                    endDay: event.endDay,
                    endMinutes: event.endTimeMinutes
                )
                if !range.isEmpty {
                    Text(range)
                        .font(.system(size: 13))
                        .foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func load() {
        goal = session.goal(year: year, month: month)
        originalGoal = goal
    }

    private func requestClose() {
        if isDirty {
            PlanningDiscardConfirmation.present { onClose() }
        } else {
            onClose()
        }
    }

    private func save() {
        session.setGoal(goal, year: year, month: month)
        onClose()
    }
}

private struct FutureEventSheet: View {
    @ObservedObject var session: PlanningSession
    let year: Int
    let month: Int
    let existing: PlanningEventRecord?
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var iconID = PlanIconCatalog.defaultID
    @State private var colorID = PlanIconColor.defaultID
    @State private var startYear = 0
    @State private var startMonth = 0
    @State private var startDay: Int?
    @State private var startMinutes: Int?
    @State private var endYear: Int?
    @State private var endMonth: Int?
    @State private var endDay: Int?
    @State private var endMinutes: Int?
    @State private var snapshot = ""
    @State private var pickingStart = false
    @State private var pickingEnd = false

    private var isNew: Bool { existing == nil }
    private var isDirty: Bool { currentSnapshot() != snapshot }
    private var canSave: Bool {
        FutureEventValidation.accepts(
            title: title,
            startYear: startYear == 0 ? year : startYear,
            startMonth: startMonth == 0 ? month : startMonth,
            startDay: startDay,
            startMinutes: startMinutes,
            endYear: endYear,
            endMonth: endMonth,
            endDay: endDay,
            endMinutes: endMinutes
        )
    }

    var body: some View {
        PlanningSystemSheetChrome(
            onClose: requestClose,
            onConfirm: save,
            confirmEnabled: canSave,
            showsControls: !pickingStart && !pickingEnd,
            centerTitle: PlanningText.string(isNew ? .addEvent : .editEvent),
            maximumBody: PlanningTokens.Sheet.maximumBody
        ) {
            VStack(alignment: .leading, spacing: PlanningTokens.Editor.sectionGap) {
                    labeled(.titleLabel) {
                        TextField(PlanningText.string(.titlePlaceholder), text: $title)
                            .padding(.horizontal, 12)
                            .frame(height: PlanningTokens.Editor.fieldHeight)
                            .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    labeled(.iconLabel) { iconRow }
                    labeled(.colorLabel) { colorRow }
                    labeled(.startLabel) { momentButton(displayYear: startYear == 0 ? year : startYear, displayMonth: startMonth == 0 ? month : startMonth, day: startDay, minutes: startMinutes) { pickingStart = true } }
                    labeled(.endLabel) { momentButton(displayYear: endYear ?? (startYear == 0 ? year : startYear), displayMonth: endMonth ?? (startMonth == 0 ? month : startMonth), day: endDay, minutes: endMinutes) { pickingEnd = true } }
                }
                .padding(.horizontal, PlanningTokens.contentInset)
                .padding(.top, PlanningTokens.Sheet.sectionSpacing)
                .padding(.bottom, 8)
        }
        .interactiveDismissDisabled(isDirty)
        .onAppear(perform: load)
        .sheet(isPresented: $pickingStart) {
            FutureMomentPicker(month: startMonth == 0 ? month : startMonth, year: startYear == 0 ? year : startYear, day: startDay, minutes: startMinutes) { pickedYear, pickedMonth, day, minutes in
                startYear = pickedYear ?? year
                startMonth = pickedMonth ?? month
                startDay = day
                startMinutes = minutes
            }
        }
        .sheet(isPresented: $pickingEnd) {
            FutureMomentPicker(month: endMonth ?? (startMonth == 0 ? month : startMonth), year: endYear ?? (startYear == 0 ? year : startYear), day: endDay ?? startDay, minutes: endMinutes) { pickedYear, pickedMonth, day, minutes in
                let anchorYear = startYear == 0 ? year : startYear
                let anchorMonth = startMonth == 0 ? month : startMonth
                endYear = pickedYear == anchorYear ? nil : pickedYear
                endMonth = pickedMonth == anchorMonth ? nil : pickedMonth
                endDay = day
                endMinutes = minutes
            }
        }
    }

    private func labeled<Content: View>(_ key: PlanningText.Key, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(PlanningText.string(key))
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.secondary)
            content()
        }
    }

    private var iconRow: some View {
        HStack(spacing: 8) {
            ForEach(PlanIconCatalog.all, id: \.id) { entry in
                Button { iconID = entry.id } label: {
                    Image(systemName: entry.symbol)
                        .font(.system(size: 18, weight: .medium))
                        .frame(width: PlanningTokens.Editor.iconCell, height: PlanningTokens.Editor.iconCell)
                        .background(Color(uiColor: .secondarySystemBackground), in: Circle())
                        .overlay(Circle().stroke(iconID == entry.id ? Color.primary : Color.clear, lineWidth: 2))
                }
                .buttonStyle(.plain)
            }
            Spacer(minLength: 0)
        }
    }

    private var colorRow: some View {
        HStack(spacing: PlanningTokens.Editor.colorGap) {
            ForEach(PlanIconColor.allCases) { choice in
                Button { colorID = choice.rawValue } label: {
                    Circle()
                        .fill(choice.color)
                        .frame(width: PlanningTokens.Editor.colorCell - 8, height: PlanningTokens.Editor.colorCell - 8)
                        .overlay(Circle().stroke(colorID == choice.rawValue ? Color.primary.opacity(0.55) : Color.clear, lineWidth: 2))
                        .frame(width: PlanningTokens.Editor.colorCell, height: PlanningTokens.Editor.colorCell)
                }
                .buttonStyle(.plain)
            }
            Spacer(minLength: 0)
        }
    }

    private func momentButton(displayYear: Int, displayMonth: Int, day: Int?, minutes: Int?, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(day == nil ? PlanningText.string(.unset) : FutureEventText.range(year: displayYear, month: displayMonth, startDay: day, startMinutes: minutes, endDay: nil, endMinutes: nil))
                .foregroundStyle(.primary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 12)
                .frame(height: PlanningTokens.Editor.fieldHeight)
                .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func load() {
        if let existing {
            title = existing.title
            iconID = PlanIconCatalog.symbol(for: existing.iconSymbol) == nil ? PlanIconCatalog.defaultID : existing.iconSymbol
            colorID = PlanIconColor.resolved(existing.colorID).rawValue
            startYear = existing.year
            startMonth = existing.month
            startDay = existing.startDay
            startMinutes = existing.timeMinutes
            endYear = existing.endYear
            endMonth = existing.endMonth
            endDay = existing.endDay
            endMinutes = existing.endTimeMinutes
        } else {
            startYear = year
            startMonth = month
        }
        snapshot = currentSnapshot()
    }

    private func currentSnapshot() -> String {
        "\(title)|\(iconID)|\(colorID)|\(startYear)|\(startMonth)|\(startDay.map(String.init) ?? "")|\(startMinutes.map(String.init) ?? "")|\(endYear.map(String.init) ?? "")|\(endMonth.map(String.init) ?? "")|\(endDay.map(String.init) ?? "")|\(endMinutes.map(String.init) ?? "")"
    }

    private func requestClose() {
        if isDirty {
            PlanningDiscardConfirmation.present { dismiss() }
        } else {
            dismiss()
        }
    }

    private func save() {
        guard canSave else { return }
        let record = PlanningEventRecord(
            id: existing?.id ?? UUID(),
            title: title.trimmingCharacters(in: .whitespacesAndNewlines),
            year: startDay == nil ? year : startYear,
            month: startDay == nil ? month : startMonth,
            startDay: startDay,
            endDay: endDay,
            endMonth: endMonth,
            endYear: endYear,
            timeMinutes: startMinutes,
            endTimeMinutes: endMinutes,
            sourceEventID: existing?.sourceEventID,
            iconSymbol: iconID,
            colorID: colorID
        )
        session.addEvent(record)
        dismiss()
    }
}

private struct FutureMomentPicker: View {
    let month: Int
    let year: Int
    let day: Int?
    let minutes: Int?
    let onPick: (Int?, Int?, Int?, Int?) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var date = Date()
    @State private var includesTime = false

    var body: some View {
        PlanningSystemSheetChrome(
            onClose: { dismiss() },
            onConfirm: commit,
            centerTitle: PlanningText.string(.unset),
            onCenter: {
                onPick(nil, nil, nil, nil)
                dismiss()
            },
            maximumBody: PlanningTokens.Sheet.maximumBody
        ) {
            VStack(alignment: .leading, spacing: 12) {
                DatePicker("Date", selection: $date, displayedComponents: .date)
                    .datePickerStyle(.graphical)
                    .environment(\.calendar, PeriodCalendar.calendar)
                    .frame(height: PlanningTokens.Sheet.calendarHeight)
                    .padding(.horizontal, 8)
                Toggle("Time", isOn: $includesTime)
                    .padding(.horizontal, 16)
                if includesTime {
                    DatePicker("Time", selection: $date, displayedComponents: .hourAndMinute)
                        .datePickerStyle(.wheel)
                        .labelsHidden()
                        .environment(\.calendar, PeriodCalendar.calendar)
                        .frame(height: PlanningTokens.Sheet.timeWheelHeight)
                }
            }
        }
        .onAppear {
            var parts = DateComponents()
            parts.year = year
            parts.month = month
            parts.day = day ?? 1
            if let minutes {
                parts.hour = minutes / 60
                parts.minute = minutes % 60
                includesTime = true
            }
            date = PeriodCalendar.calendar.date(from: parts) ?? Date()
        }
    }

    private func commit() {
        let parts = PeriodCalendar.calendar.dateComponents([.year, .month, .day, .hour, .minute], from: date)
        let pickedMinutes = includesTime ? ((parts.hour ?? 0) * 60 + (parts.minute ?? 0)) : nil
        onPick(parts.year, parts.month, parts.day, pickedMinutes)
        dismiss()
    }
}

