import Foundation

enum RoutineTimeMode: String, Codable, Hashable {
    case anytime
    case clock
    case range
}

struct RoutineDefinition: Identifiable, Hashable, Codable {
    var id = UUID()
    var title: String
    var iconSymbol: String
    var everyDay: Bool
    var weekdays: Set<Int>
    var timeMode: RoutineTimeMode
    var startMinutes: Int?
    var endMinutes: Int?
    var isPaused: Bool
    var createdAt: Date
    var updatedAt: Date
}

struct RoutineCompletion: Hashable, Codable {
    var routineID: UUID
    var dayKey: String
}

struct QuickMemo: Identifiable, Hashable, Codable {
    var id = UUID()
    var text: String
    var minutes: Int
    var iconSymbol: String
    var createdAt: Date
    var dayKey: String
    var colorID: String = PlanIconColor.defaultID

    init(id: UUID = UUID(), text: String, minutes: Int, iconSymbol: String, createdAt: Date, dayKey: String, colorID: String = PlanIconColor.defaultID) {
        self.id = id
        self.text = text
        self.minutes = minutes
        self.iconSymbol = iconSymbol
        self.createdAt = createdAt
        self.dayKey = dayKey
        self.colorID = colorID
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        text = try container.decode(String.self, forKey: .text)
        minutes = try container.decode(Int.self, forKey: .minutes)
        iconSymbol = try container.decode(String.self, forKey: .iconSymbol)
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        dayKey = try container.decode(String.self, forKey: .dayKey)
        colorID = try container.decodeIfPresent(String.self, forKey: .colorID) ?? PlanIconColor.defaultID
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(text, forKey: .text)
        try container.encode(minutes, forKey: .minutes)
        try container.encode(iconSymbol, forKey: .iconSymbol)
        try container.encode(createdAt, forKey: .createdAt)
        try container.encode(dayKey, forKey: .dayKey)
        try container.encode(colorID, forKey: .colorID)
    }

    private enum CodingKeys: String, CodingKey {
        case id, text, minutes, iconSymbol, createdAt, dayKey, colorID
    }
}

enum TodayWeekChoice: Hashable {
    case everyDay
    case weekday(Int)
}

struct TodayWeekSlice: Hashable {
    var index: Int
    var start: Date
    var end: Date
    var elapsedDays: Int
    var achievedDays: Int
}

enum TodayHistoryLabel {
    static func heading(key: String, todayKey: String) -> String {
        guard let date = PeriodCalendar.date(from: key) else { return key }
        let calendar = PeriodCalendar.calendar
        let weekday = calendar.shortWeekdaySymbols[calendar.component(.weekday, from: date) - 1]
        let month = calendar.component(.month, from: date)
        let day = calendar.component(.day, from: date)
        let year = calendar.component(.year, from: date)
        if key == todayKey { return "今日 \(month)月\(day)日（\(weekday)）" }
        if key == PeriodCalendar.shift(todayKey, bucket: .daily, by: -1) { return "昨日 \(month)月\(day)日（\(weekday)）" }
        return "\(year)年\(month)月\(day)日（\(weekday)）"
    }
}

enum TodayDayBoundary {
    static func dayKey(for date: Date, hour: Int, calendar: Calendar = PeriodCalendar.calendar) -> String {
        let shifted = calendar.date(byAdding: .hour, value: -max(hour, 0), to: date) ?? date
        return PeriodCalendar.dayKey(shifted)
    }
}

enum RoutineAchievementTone {
    /// Categories use the displayed, rounded percentage. 0 stays neutral; 25 is purple, not red.
    static func name(for percent: Int) -> String {
        if percent <= 0 { return "neutral" }
        if percent < 25 { return "red" }
        if percent < 50 { return "purple" }
        if percent < 75 { return "blue" }
        return "green"
    }

    /// Months before the routine existed have no achievement. Later months use recorded completions.
    static func monthAvailable(createdAt: Date, monthKey: String) -> Bool {
        monthKey >= PeriodCalendar.currentKey(.monthly, now: createdAt)
    }

    static func monthLabel(_ key: String) -> String {
        let parts = key.split(separator: "-")
        let month = parts.count > 1 ? Int(parts[1]) ?? 1 : 1
        return "\(month)月"
    }
}

enum TodayAchievement {
    static func rate(achieved: Int, elapsed: Int) -> Int {
        guard elapsed > 0 else { return 0 }
        let value = Int((Double(achieved) / Double(elapsed) * 100).rounded())
        return min(100, max(0, value))
    }

    static func elapsedDayCount(monthContaining now: Date, calendar: Calendar = PeriodCalendar.calendar) -> Int {
        let parts = calendar.dateComponents([.year, .month], from: now)
        let start = calendar.date(from: DateComponents(year: parts.year, month: parts.month, day: 1)) ?? now
        let today = calendar.startOfDay(for: now)
        let day = calendar.dateComponents([.day], from: calendar.startOfDay(for: start), to: today).day ?? 0
        return max(day + 1, 1)
    }

    static func applyWeekday(everyDay: Bool, days: Set<Int>, choice: TodayWeekChoice) -> (everyDay: Bool, days: Set<Int>) {
        switch choice {
        case .everyDay:
            return (true, [])
        case .weekday(let value):
            var next = everyDay ? [] : days
            if next.contains(value) { next.remove(value) } else { next.insert(value) }
            if next.isEmpty { return (true, []) }
            return (false, next)
        }
    }

    static func occurs(everyDay: Bool, weekdays: Set<Int>, on date: Date, calendar: Calendar = PeriodCalendar.calendar) -> Bool {
        if everyDay { return true }
        return weekdays.contains(calendar.component(.weekday, from: date))
    }

    static func weeks(monthContaining now: Date, achieved: Set<String>, calendar: Calendar = PeriodCalendar.calendar) -> [TodayWeekSlice] {
        let parts = calendar.dateComponents([.year, .month], from: now)
        guard let monthStart = calendar.date(from: DateComponents(year: parts.year, month: parts.month, day: 1)),
              let dayRange = calendar.range(of: .day, in: .month, for: monthStart),
              let monthEnd = calendar.date(from: DateComponents(year: parts.year, month: parts.month, day: dayRange.count)) else { return [] }
        let today = calendar.startOfDay(for: now)
        var slices: [TodayWeekSlice] = []
        var cursor = monthStart
        var index = 1
        while cursor <= monthEnd {
            let weekStart = calendar.dateInterval(of: .weekOfYear, for: cursor)?.start ?? cursor
            let weekEnd = calendar.date(byAdding: .day, value: 6, to: calendar.startOfDay(for: weekStart)) ?? weekStart
            let sliceStart = max(calendar.startOfDay(for: monthStart), calendar.startOfDay(for: weekStart))
            let sliceEnd = min(calendar.startOfDay(for: monthEnd), calendar.startOfDay(for: weekEnd))
            var elapsed = 0
            var done = 0
            var day = sliceStart
            while day <= sliceEnd {
                if day <= today {
                    elapsed += 1
                    if achieved.contains(PeriodCalendar.dayKey(day)) { done += 1 }
                }
                guard let next = calendar.date(byAdding: .day, value: 1, to: day) else { break }
                day = next
            }
            slices.append(TodayWeekSlice(index: index, start: sliceStart, end: sliceEnd, elapsedDays: elapsed, achievedDays: done))
            guard let nextWeek = calendar.date(byAdding: .day, value: 1, to: sliceEnd) else { break }
            cursor = nextWeek
            index += 1
        }
        return slices
    }

    static func monthKeys(endingAt now: Date, count: Int, calendar: Calendar = PeriodCalendar.calendar) -> [String] {
        (0..<count).reversed().compactMap { offset in
            let date = calendar.date(byAdding: .month, value: -offset, to: now) ?? now
            return PeriodCalendar.currentKey(.monthly, now: date)
        }
    }
}

enum TodayPersistence {
    private static let routineKey = "today.routines"
    private static let completionKey = "today.routineCompletions"
    private static let memoKey = "today.quickMemos"

    static func loadRoutines() -> [RoutineDefinition] { load(routineKey) }
    static func loadCompletions() -> [RoutineCompletion] { load(completionKey) }
    static func loadMemos() -> [QuickMemo] { load(memoKey) }

    static func store(routines: [RoutineDefinition], completions: [RoutineCompletion], memos: [QuickMemo]) {
        save(routines, routineKey)
        save(completions, completionKey)
        save(memos, memoKey)
    }

    private static func load<T: Decodable>(_ key: String) -> [T] {
        guard let data = UserDefaults.standard.data(forKey: key) else { return [] }
        return (try? JSONDecoder().decode([T].self, from: data)) ?? []
    }

    private static func save<T: Encodable>(_ value: [T], _ key: String) {
        if let data = try? JSONEncoder().encode(value) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }
}

extension PlanningSession {
    func refreshTodayStamp(now: Date = Date()) {
        let key = TodayDayBoundary.dayKey(for: now, hour: todayDayBoundaryHour)
        if key != todayStamp { todayStamp = key }
    }

    func todayTasks() -> [PlanningNode] {
        nodes(bucket: .daily, periodKey: todayStamp, kind: .task)
    }

    func visibleRoutines(now: Date = Date()) -> [RoutineDefinition] {
        let key = TodayDayBoundary.dayKey(for: now, hour: todayDayBoundaryHour)
        guard let date = PeriodCalendar.date(from: key) else { return [] }
        return routines.filter { routine in
            !routine.isPaused && TodayAchievement.occurs(everyDay: routine.everyDay, weekdays: routine.weekdays, on: date)
        }
    }

    func routineCompleted(_ routine: RoutineDefinition, dayKey: String) -> Bool {
        routineCompletions.contains { $0.routineID == routine.id && $0.dayKey == dayKey }
    }

    func toggleRoutine(_ routine: RoutineDefinition, dayKey: String) {
        if let index = routineCompletions.firstIndex(where: { $0.routineID == routine.id && $0.dayKey == dayKey }) {
            routineCompletions.remove(at: index)
        } else {
            routineCompletions.append(RoutineCompletion(routineID: routine.id, dayKey: dayKey))
        }
        persistToday()
    }

    func saveRoutine(_ routine: RoutineDefinition, isNew: Bool) {
        var next = routine
        next.updatedAt = Date()
        if isNew { next.createdAt = next.updatedAt }
        if let index = routines.firstIndex(where: { $0.id == next.id }) {
            routines[index] = next
        } else {
            routines.append(next)
        }
        persistToday()
    }

    func deleteRoutine(_ id: UUID) {
        routines.removeAll { $0.id == id }
        persistToday()
    }

    func saveMemo(_ memo: QuickMemo, isNew: Bool) {
        var next = memo
        if isNew {
            let now = Date()
            next.createdAt = now
            let parts = PeriodCalendar.calendar.dateComponents([.hour, .minute], from: now)
            next.minutes = (parts.hour ?? 0) * 60 + (parts.minute ?? 0)
            next.dayKey = PeriodCalendar.dayKey(now)
        } else if let existing = quickMemos.first(where: { $0.id == next.id }) {
            next.createdAt = existing.createdAt
            next.minutes = existing.minutes
            next.dayKey = existing.dayKey
        }
        if let index = quickMemos.firstIndex(where: { $0.id == next.id }) {
            quickMemos[index] = next
        } else {
            quickMemos.insert(next, at: 0)
        }
        persistToday()
    }

    func deleteMemo(_ id: UUID) {
        quickMemos.removeAll { $0.id == id }
        persistToday()
    }

    func pastTaskGroups(now: Date = Date()) -> [(key: String, nodes: [PlanningNode])] {
        let calendar = PeriodCalendar.calendar
        let today = calendar.startOfDay(for: now)
        guard let earliest = calendar.date(byAdding: .day, value: -14, to: today) else { return [] }
        let tasks = periodItems.filter { node in
            guard node.kind == .task, let date = PeriodCalendar.date(from: node.periodKey) else { return false }
            let day = calendar.startOfDay(for: date)
            return day >= calendar.startOfDay(for: earliest) && day < today
        }
        let grouped = Dictionary(grouping: tasks, by: \.periodKey)
        return grouped.keys.sorted(by: >).map { ($0, grouped[$0] ?? []) }
    }

    func todayImportDraft(from source: PlanningNode) -> PlanningItemDraft {
        var draft = PlanningItemDraft(node: source)
        draft.startDay = nil
        draft.endDay = nil
        draft.startMinutes = nil
        draft.endMinutes = nil
        draft.subtasks = source.children.map { child in
            PlanningSubtaskDraft(id: UUID(), title: child.title, startDay: nil, endDay: nil, startMinutes: nil, endMinutes: nil)
        }
        return draft
    }

    func routineMonthRate(_ routine: RoutineDefinition, now: Date = Date()) -> Int {
        let elapsed = TodayAchievement.elapsedDayCount(monthContaining: now)
        let achieved = achievedDayCount(routine, now: now)
        return TodayAchievement.rate(achieved: achieved, elapsed: elapsed)
    }

    func achievedDayCount(_ routine: RoutineDefinition, now: Date = Date()) -> Int {
        let calendar = PeriodCalendar.calendar
        let parts = calendar.dateComponents([.year, .month], from: now)
        let prefix = String(format: "%04d-%02d", parts.year ?? 0, parts.month ?? 0)
        let today = PeriodCalendar.dayKey(now)
        return Set(routineCompletions.filter { record in
            record.routineID == routine.id && record.dayKey.hasPrefix(prefix) && record.dayKey <= today
        }.map(\.dayKey)).count
    }

    private func persistToday() {
        TodayPersistence.store(routines: routines, completions: routineCompletions, memos: quickMemos)
    }
}
