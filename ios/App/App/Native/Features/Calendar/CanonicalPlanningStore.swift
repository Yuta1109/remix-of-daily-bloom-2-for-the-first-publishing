import Foundation

/// Additive planning/calendar foundation.
///
/// `PlanningSession` remains the live screen store. The existing cascade delete is unchanged.
/// Switch-over later means: stop writing `periodItems` / `events` as copies, read
/// `effectiveItems` instead, and persist this document rather than only navigation keys.
/// Do not call these methods from Planning or Today screens in this phase.
///
/// The Windows twin is `src/lib/canonical-planning-foundation.ts`.

enum CanonicalPlanningLevel: String, Codable, CaseIterable {
    case future, monthly, weekly, daily
}

enum CanonicalPlanningKind: String, Codable {
    case task, event
}

enum CanonicalRepeatFrequency: String, Codable {
    case none, daily, weekly, monthly, monthlyWeekday, yearly
}

struct CanonicalDate: Codable, Hashable, Comparable {
    var year: Int
    var month: Int
    var day: Int

    var key: String { String(format: "%04d-%02d-%02d", year, month, day) }

    static func < (lhs: CanonicalDate, rhs: CanonicalDate) -> Bool { lhs.key < rhs.key }

    static func parse(_ key: String) -> CanonicalDate? {
        let pieces = key.split(separator: "-")
        guard pieces.count == 3, let year = Int(pieces[0]), let month = Int(pieces[1]), let day = Int(pieces[2]) else { return nil }
        return CanonicalDate(year: year, month: month, day: day)
    }
}

struct CanonicalRecurrenceRule: Codable, Hashable {
    var frequency: CanonicalRepeatFrequency
    var endDate: String?

    private enum CodingKeys: String, CodingKey {
        case frequency, endDate
    }

    init(frequency: CanonicalRepeatFrequency = .none, endDate: String? = nil) {
        self.frequency = frequency
        self.endDate = endDate
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(frequency, forKey: .frequency)
        try container.encodeIfPresent(endDate, forKey: .endDate)
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        frequency = try container.decodeIfPresent(CanonicalRepeatFrequency.self, forKey: .frequency) ?? .none
        endDate = try container.decodeIfPresent(String.self, forKey: .endDate)
    }
}

struct CanonicalPayload: Codable, Identifiable, Hashable {
    var id: String
    var legacyWebID: String?
    var kind: CanonicalPlanningKind
    var origin: CanonicalPlanningLevel
    var originPeriodKey: String
    var title: String
    var iconSymbol: String
    var colorID: String?
    var legacyColorKey: String?
    var location: String
    var memo: String
    var allDay: Bool
    var startDate: String?
    var endDate: String?
    var startMinutes: Int?
    var endMinutes: Int?
    var reminders: [String]
    var recurrence: CanonicalRecurrenceRule
    var liveActivity: Bool
    var liveActivityLead: String?
    var updatedAt: String
    var todayTaskID: String?
    var completed: Bool
    /// Tutorial row. Production saves omit it. Real rows stay even if the title matches a sample.
    var isSample: Bool
    var parentID: String?
    var childOrder: Int?

    private enum CodingKeys: String, CodingKey {
        case id, legacyWebID, kind, origin, originPeriodKey, title, iconSymbol, colorID, legacyColorKey
        case location, memo, allDay, startDate, endDate, startMinutes, endMinutes, reminders, recurrence
        case liveActivity, liveActivityLead, updatedAt, todayTaskID, completed, isSample, parentID, childOrder
    }

    init(
        id: String,
        legacyWebID: String?,
        kind: CanonicalPlanningKind,
        origin: CanonicalPlanningLevel,
        originPeriodKey: String,
        title: String,
        iconSymbol: String,
        colorID: String?,
        legacyColorKey: String?,
        location: String,
        memo: String,
        allDay: Bool,
        startDate: String?,
        endDate: String?,
        startMinutes: Int?,
        endMinutes: Int?,
        reminders: [String],
        recurrence: CanonicalRecurrenceRule,
        liveActivity: Bool,
        liveActivityLead: String?,
        updatedAt: String,
        todayTaskID: String?,
        completed: Bool,
        isSample: Bool = false,
        parentID: String? = nil,
        childOrder: Int? = nil
    ) {
        self.id = id
        self.legacyWebID = legacyWebID
        self.kind = kind
        self.origin = origin
        self.originPeriodKey = originPeriodKey
        self.title = title
        self.iconSymbol = iconSymbol
        self.colorID = colorID
        self.legacyColorKey = legacyColorKey
        self.location = location
        self.memo = memo
        self.allDay = allDay
        self.startDate = startDate
        self.endDate = endDate
        self.startMinutes = startMinutes
        self.endMinutes = endMinutes
        self.reminders = reminders
        self.recurrence = recurrence
        self.liveActivity = liveActivity
        self.liveActivityLead = liveActivityLead
        self.updatedAt = updatedAt
        self.todayTaskID = todayTaskID
        self.completed = completed
        self.isSample = isSample
        self.parentID = parentID
        self.childOrder = childOrder
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encodeIfPresent(legacyWebID, forKey: .legacyWebID)
        try container.encode(kind, forKey: .kind)
        try container.encode(origin, forKey: .origin)
        try container.encode(originPeriodKey, forKey: .originPeriodKey)
        try container.encode(title, forKey: .title)
        try container.encode(iconSymbol, forKey: .iconSymbol)
        try container.encodeIfPresent(colorID, forKey: .colorID)
        try container.encodeIfPresent(legacyColorKey, forKey: .legacyColorKey)
        try container.encode(location, forKey: .location)
        try container.encode(memo, forKey: .memo)
        try container.encode(allDay, forKey: .allDay)
        try container.encodeIfPresent(startDate, forKey: .startDate)
        try container.encodeIfPresent(endDate, forKey: .endDate)
        try container.encodeIfPresent(startMinutes, forKey: .startMinutes)
        try container.encodeIfPresent(endMinutes, forKey: .endMinutes)
        try container.encode(reminders, forKey: .reminders)
        try container.encode(recurrence, forKey: .recurrence)
        try container.encode(liveActivity, forKey: .liveActivity)
        try container.encodeIfPresent(liveActivityLead, forKey: .liveActivityLead)
        try container.encode(updatedAt, forKey: .updatedAt)
        try container.encodeIfPresent(todayTaskID, forKey: .todayTaskID)
        try container.encode(completed, forKey: .completed)
        try container.encode(isSample, forKey: .isSample)
        try container.encodeIfPresent(parentID, forKey: .parentID)
        try container.encodeIfPresent(childOrder, forKey: .childOrder)
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        legacyWebID = try container.decodeIfPresent(String.self, forKey: .legacyWebID)
        kind = try container.decode(CanonicalPlanningKind.self, forKey: .kind)
        origin = try container.decode(CanonicalPlanningLevel.self, forKey: .origin)
        originPeriodKey = try container.decode(String.self, forKey: .originPeriodKey)
        title = try container.decode(String.self, forKey: .title)
        iconSymbol = try container.decodeIfPresent(String.self, forKey: .iconSymbol) ?? "calendar"
        colorID = try container.decodeIfPresent(String.self, forKey: .colorID)
        legacyColorKey = try container.decodeIfPresent(String.self, forKey: .legacyColorKey)
        location = try container.decodeIfPresent(String.self, forKey: .location) ?? ""
        memo = try container.decodeIfPresent(String.self, forKey: .memo) ?? ""
        allDay = try container.decodeIfPresent(Bool.self, forKey: .allDay) ?? false
        startDate = try container.decodeIfPresent(String.self, forKey: .startDate)
        endDate = try container.decodeIfPresent(String.self, forKey: .endDate)
        startMinutes = try container.decodeIfPresent(Int.self, forKey: .startMinutes)
        endMinutes = try container.decodeIfPresent(Int.self, forKey: .endMinutes)
        reminders = try container.decodeIfPresent([String].self, forKey: .reminders) ?? []
        recurrence = try container.decodeIfPresent(CanonicalRecurrenceRule.self, forKey: .recurrence) ?? CanonicalRecurrenceRule()
        liveActivity = try container.decodeIfPresent(Bool.self, forKey: .liveActivity) ?? false
        liveActivityLead = try container.decodeIfPresent(String.self, forKey: .liveActivityLead)
        updatedAt = try container.decodeIfPresent(String.self, forKey: .updatedAt) ?? ""
        todayTaskID = try container.decodeIfPresent(String.self, forKey: .todayTaskID)
        completed = try container.decodeIfPresent(Bool.self, forKey: .completed) ?? false
        isSample = try container.decodeIfPresent(Bool.self, forKey: .isSample) ?? false
        parentID = try container.decodeIfPresent(String.self, forKey: .parentID)
        childOrder = try container.decodeIfPresent(Int.self, forKey: .childOrder)
    }
}

struct CanonicalTombstone: Codable, Hashable {
    var logicalID: String
    var level: CanonicalPlanningLevel
    var periodKey: String
}

struct CanonicalLevelOverride: Codable, Hashable {
    var logicalID: String
    var level: CanonicalPlanningLevel
    var periodKey: String
    var title: String?
    var iconSymbol: String?
    var colorID: String?
    var location: String?
    var memo: String?
    var reminders: [String]?
    var liveActivity: Bool?
    var liveActivityLead: String?
}

struct CanonicalOccurrenceOverride: Codable, Hashable {
    var logicalID: String
    var occurrenceDate: String
    var excluded: Bool
    var title: String?
    var location: String?
    var memo: String?
    var startMinutes: Int?
    var endMinutes: Int?
    var reminders: [String]?
    var liveActivity: Bool?
    var liveActivityLead: String?
}

struct CanonicalDayCompletion: Codable, Hashable {
    var logicalID: String
    var date: String
    var completed: Bool
}

struct CanonicalReflectionSnapshot: Codable, Hashable {
    var id: String
    var completed: Bool
    var decisionIDs: [String]
}

enum CanonicalReflectionDisposition: String, Codable {
    case keep, postpone, stop
}

struct CanonicalReflectionDecision: Codable, Hashable {
    var id: String
    var level: CanonicalPlanningLevel
    var periodKey: String
    var logicalID: String
    var occurrenceDate: String?
    var disposition: CanonicalReflectionDisposition
    var completed: Bool
    var isSample: Bool = false
}

struct CanonicalPlanningDocument: Codable {
    static let schemaVersion = 1
    var schemaVersion: Int
    /// Remains unresolved. A missing WebKit reader must not be stored as a finished migration.
    var legacyMigration: String
    var payloads: [CanonicalPayload]
    var tombstones: [CanonicalTombstone]
    var levelOverrides: [CanonicalLevelOverride]
    var occurrenceOverrides: [CanonicalOccurrenceOverride]
    var dayCompletions: [CanonicalDayCompletion]
    var reflectionSnapshots: [CanonicalReflectionSnapshot]
    var reflectionDecisions: [CanonicalReflectionDecision]

    private enum CodingKeys: String, CodingKey {
        case schemaVersion, legacyMigration, payloads, tombstones, levelOverrides, occurrenceOverrides, dayCompletions, reflectionSnapshots, reflectionDecisions
    }

    init(
        schemaVersion: Int,
        legacyMigration: String,
        payloads: [CanonicalPayload],
        tombstones: [CanonicalTombstone],
        levelOverrides: [CanonicalLevelOverride],
        occurrenceOverrides: [CanonicalOccurrenceOverride],
        dayCompletions: [CanonicalDayCompletion],
        reflectionSnapshots: [CanonicalReflectionSnapshot],
        reflectionDecisions: [CanonicalReflectionDecision] = []
    ) {
        self.schemaVersion = schemaVersion
        self.legacyMigration = legacyMigration
        self.payloads = payloads
        self.tombstones = tombstones
        self.levelOverrides = levelOverrides
        self.occurrenceOverrides = occurrenceOverrides
        self.dayCompletions = dayCompletions
        self.reflectionSnapshots = reflectionSnapshots
        self.reflectionDecisions = reflectionDecisions
    }

    static func empty() -> CanonicalPlanningDocument {
        CanonicalPlanningDocument(
            schemaVersion: schemaVersion,
            legacyMigration: "unresolved",
            payloads: [],
            tombstones: [],
            levelOverrides: [],
            occurrenceOverrides: [],
            dayCompletions: [],
            reflectionSnapshots: []
        )
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(schemaVersion, forKey: .schemaVersion)
        try container.encode(legacyMigration, forKey: .legacyMigration)
        try container.encode(payloads, forKey: .payloads)
        try container.encode(tombstones, forKey: .tombstones)
        try container.encode(levelOverrides, forKey: .levelOverrides)
        try container.encode(occurrenceOverrides, forKey: .occurrenceOverrides)
        try container.encode(dayCompletions, forKey: .dayCompletions)
        try container.encode(reflectionSnapshots, forKey: .reflectionSnapshots)
        try container.encode(reflectionDecisions, forKey: .reflectionDecisions)
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try container.decodeIfPresent(Int.self, forKey: .schemaVersion) ?? 0
        legacyMigration = "unresolved"
        payloads = try container.decodeIfPresent([CanonicalPayload].self, forKey: .payloads) ?? []
        tombstones = try container.decodeIfPresent([CanonicalTombstone].self, forKey: .tombstones) ?? []
        levelOverrides = try container.decodeIfPresent([CanonicalLevelOverride].self, forKey: .levelOverrides) ?? []
        occurrenceOverrides = try container.decodeIfPresent([CanonicalOccurrenceOverride].self, forKey: .occurrenceOverrides) ?? []
        dayCompletions = try container.decodeIfPresent([CanonicalDayCompletion].self, forKey: .dayCompletions) ?? []
        reflectionSnapshots = try container.decodeIfPresent([CanonicalReflectionSnapshot].self, forKey: .reflectionSnapshots) ?? []
        reflectionDecisions = try container.decodeIfPresent([CanonicalReflectionDecision].self, forKey: .reflectionDecisions) ?? []
    }
}

struct CanonicalEffectiveItem: Hashable {
    var logicalID: String
    var kind: CanonicalPlanningKind
    var level: CanonicalPlanningLevel
    var periodKey: String
    var occurrenceKey: String
    var title: String
    var iconSymbol: String
    var colorID: String?
    var location: String
    var memo: String
    var allDay: Bool
    var startDate: String?
    var endDate: String?
    var startMinutes: Int?
    var endMinutes: Int?
    var reminders: [String]
    var liveActivity: Bool
    var liveActivityLead: String?
    var completed: Bool
    var todayTaskID: String?
    var parentID: String?
    var childOrder: Int?
}

struct CanonicalCreateInput {
    var id: String = UUID().uuidString
    var legacyWebID: String?
    var kind: CanonicalPlanningKind
    var origin: CanonicalPlanningLevel
    var originPeriodKey: String
    var title: String
    var iconSymbol: String = "calendar"
    var colorID: String?
    var legacyColorKey: String?
    var location: String = ""
    var memo: String = ""
    var allDay: Bool = false
    var startDate: String?
    var endDate: String?
    var startMinutes: Int?
    var endMinutes: Int?
    var reminders: [String] = []
    var recurrence: CanonicalRecurrenceRule = CanonicalRecurrenceRule()
    var liveActivity: Bool = false
    var liveActivityLead: String?
    var updatedAt: String = ""
    var todayTaskID: String?
    var completed: Bool = false
    var isSample: Bool = false
    var parentID: String?
    var childOrder: Int?
}

struct LegacyCalendarRecord: Codable {
    var id: String
    var title: String
    var date: String
    var endDate: String?
    var allDay: Bool?
    var startTime: String?
    var endTime: String?
    var color: String?
    var location: String?
    var notes: String?
    var reminders: [String]?
    var repeatFrequency: String?
    var repeatEndDate: String?
    var liveActivity: Bool?
    var liveActivityLead: String?
    var updatedAt: String?
    var excludeDates: [String]?
    var recurrenceMasterId: String?
    var recurrenceDate: String?
    var icon: String?

    enum CodingKeys: String, CodingKey {
        case id, title, date, endDate, allDay, startTime, endTime, color, location, notes, reminders
        case repeatFrequency = "repeat"
        case repeatEndDate, liveActivity, liveActivityLead, updatedAt, excludeDates, recurrenceMasterId, recurrenceDate, icon
    }
}

enum CanonicalPlanningCalendar {
    static let horizonDays = 400

    static var calendar: Calendar {
        var value = Calendar(identifier: .gregorian)
        value.locale = Locale(identifier: "ja_JP")
        value.firstWeekday = 2
        return value
    }

    static func date(_ day: CanonicalDate) -> Date? {
        calendar.date(from: DateComponents(year: day.year, month: day.month, day: day.day))
    }

    static func day(from date: Date) -> CanonicalDate {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return CanonicalDate(year: parts.year ?? 2026, month: parts.month ?? 1, day: parts.day ?? 1)
    }

    static func addDays(_ day: CanonicalDate, _ count: Int) -> CanonicalDate {
        guard let date = date(day), let moved = calendar.date(byAdding: .day, value: count, to: date) else { return day }
        return self.day(from: moved)
    }

    static func weekStart(_ day: CanonicalDate) -> CanonicalDate {
        guard let date = date(day) else { return day }
        let start = calendar.dateInterval(of: .weekOfYear, for: date)?.start ?? date
        return self.day(from: start)
    }

    static func periodKey(_ level: CanonicalPlanningLevel, _ day: CanonicalDate) -> String {
        switch level {
        case .future: String(day.year)
        case .monthly: String(format: "%04d-%02d", day.year, day.month)
        case .weekly: weekStart(day).key
        case .daily: day.key
        }
    }
}

enum LegacyCalendarColorMap {
    /// Shared hue families from `EVENT_COLORS` and `PlanIconColor`.
    /// blue 212° → sky, green 145° → mint, orange 25° → peach, pink 335° → rose, purple 265° → lavender.
    static let resolved = ["blue": "sky", "green": "mint", "orange": "peach", "pink": "rose", "purple": "lavender"]
    /// red 0°, teal 180°, and gray have no Planning pastel.
    static let unresolved = ["red", "teal", "gray"]
}

enum CanonicalPlanningEngine {
    static func projectedKeys(_ document: CanonicalPlanningDocument, _ payload: CanonicalPayload, _ level: CanonicalPlanningLevel) -> [String] {
        guard flows(payload.kind, payload.origin, level) else { return [] }
        guard payload.startDate != nil else {
            if level == payload.origin, !tombstoned(document, payload.id, level, payload.originPeriodKey) {
                return [payload.originPeriodKey]
            }
            return []
        }
        var keys = Set<String>()
        for row in coveredDates(document, payload) {
            guard let day = CanonicalDate.parse(row.date) else { continue }
            let key = CanonicalPlanningCalendar.periodKey(level, day)
            if !tombstoned(document, payload.id, level, key) { keys.insert(key) }
        }
        return keys.sorted()
    }

    static func effectiveItems(_ document: CanonicalPlanningDocument, _ level: CanonicalPlanningLevel, _ key: String) -> [CanonicalEffectiveItem] {
        var items: [CanonicalEffectiveItem] = []
        var seen = Set<String>()
        for payload in document.payloads {
            guard projectedKeys(document, payload, level).contains(key), !seen.contains(payload.id) else { continue }
            seen.insert(payload.id)
            let levelOverride = document.levelOverrides.first { $0.logicalID == payload.id && $0.level == level && $0.periodKey == key }
            let covering = level == .daily
                ? instancesCovering(payload, key).filter { start in
                    !document.occurrenceOverrides.contains { $0.logicalID == payload.id && $0.occurrenceDate == start && $0.excluded }
                }
                : []
            let occurrenceDate = covering.count == 1
                ? covering[0]
                : coveredDates(document, payload).first { row in
                    guard let day = CanonicalDate.parse(row.date) else { return false }
                    return CanonicalPlanningCalendar.periodKey(level, day) == key
                }?.occurrenceDate ?? payload.originPeriodKey
            let occurrence = covering.count == 1
                ? document.occurrenceOverrides.first { $0.logicalID == payload.id && $0.occurrenceDate == occurrenceDate && !$0.excluded }
                : covering.count > 1 ? nil : document.occurrenceOverrides.first { $0.logicalID == payload.id && $0.occurrenceDate == occurrenceDate && !$0.excluded }
            items.append(CanonicalEffectiveItem(
                logicalID: payload.id,
                kind: payload.kind,
                level: level,
                periodKey: key,
                occurrenceKey: "\(payload.id)|\(occurrenceDate)",
                title: occurrence?.title ?? levelOverride?.title ?? payload.title,
                iconSymbol: levelOverride?.iconSymbol ?? payload.iconSymbol,
                colorID: levelOverride?.colorID ?? payload.colorID,
                location: occurrence?.location ?? levelOverride?.location ?? payload.location,
                memo: occurrence?.memo ?? levelOverride?.memo ?? payload.memo,
                allDay: payload.allDay,
                startDate: payload.startDate,
                endDate: payload.endDate,
                startMinutes: occurrence?.startMinutes ?? payload.startMinutes,
                endMinutes: occurrence?.endMinutes ?? payload.endMinutes,
                reminders: occurrence?.reminders ?? levelOverride?.reminders ?? payload.reminders,
                liveActivity: occurrence?.liveActivity ?? levelOverride?.liveActivity ?? payload.liveActivity,
                liveActivityLead: occurrence?.liveActivityLead ?? levelOverride?.liveActivityLead ?? payload.liveActivityLead,
                completed: payload.kind == .event
                    ? (level == .daily && document.dayCompletions.contains { $0.logicalID == payload.id && $0.date == key && $0.completed })
                    : payload.completed,
                todayTaskID: payload.todayTaskID,
                parentID: payload.parentID,
                childOrder: payload.childOrder
            ))
        }
        return items
    }

    static func createItem(_ document: inout CanonicalPlanningDocument, _ input: CanonicalCreateInput) -> CanonicalPayload? {
        if let start = input.startDate, let end = input.endDate ?? input.startDate, end < start { return nil }
        let payload = CanonicalPayload(
            id: input.id,
            legacyWebID: input.legacyWebID,
            kind: input.kind,
            origin: input.origin,
            originPeriodKey: input.originPeriodKey,
            title: input.title,
            iconSymbol: input.iconSymbol,
            colorID: input.colorID,
            legacyColorKey: input.legacyColorKey,
            location: input.location,
            memo: input.memo,
            allDay: input.allDay,
            startDate: input.startDate,
            endDate: input.endDate ?? input.startDate,
            startMinutes: input.allDay ? nil : input.startMinutes,
            endMinutes: input.allDay ? nil : input.endMinutes,
            reminders: input.reminders,
            recurrence: input.recurrence,
            liveActivity: input.liveActivity,
            liveActivityLead: input.liveActivityLead,
            updatedAt: input.updatedAt,
            todayTaskID: input.todayTaskID,
            completed: input.completed,
            isSample: input.isSample,
            parentID: input.parentID,
            childOrder: input.childOrder
        )
        document.payloads.append(payload)
        return payload
    }

    static func deleteLevel(_ document: inout CanonicalPlanningDocument, _ logicalID: String, _ level: CanonicalPlanningLevel, _ key: String) {
        guard !tombstoned(document, logicalID, level, key) else { return }
        document.tombstones.append(CanonicalTombstone(logicalID: logicalID, level: level, periodKey: key))
    }

    static func editPayload(_ document: inout CanonicalPlanningDocument, _ logicalID: String, _ update: (inout CanonicalPayload) -> Void) {
        guard let index = document.payloads.firstIndex(where: { $0.id == logicalID }) else { return }
        var next = document.payloads[index]
        update(&next)
        if let start = next.startDate, let end = next.endDate, end < start { return }
        next.id = logicalID
        document.payloads[index] = next
        pruneStaleDateOverrides(&document, logicalID)
    }

    static func editLevel(_ document: inout CanonicalPlanningDocument, _ logicalID: String, _ level: CanonicalPlanningLevel, _ key: String, _ update: (inout CanonicalLevelOverride) -> Void) {
        if let index = document.levelOverrides.firstIndex(where: { $0.logicalID == logicalID && $0.level == level && $0.periodKey == key }) {
            update(&document.levelOverrides[index])
        } else {
            var row = CanonicalLevelOverride(logicalID: logicalID, level: level, periodKey: key)
            update(&row)
            document.levelOverrides.append(row)
        }
    }

    static func editOccurrence(_ document: inout CanonicalPlanningDocument, _ logicalID: String, _ occurrenceDate: String, _ update: (inout CanonicalOccurrenceOverride) -> Void) {
        if let index = document.occurrenceOverrides.firstIndex(where: { $0.logicalID == logicalID && $0.occurrenceDate == occurrenceDate }) {
            document.occurrenceOverrides[index].excluded = false
            update(&document.occurrenceOverrides[index])
        } else {
            var row = CanonicalOccurrenceOverride(logicalID: logicalID, occurrenceDate: occurrenceDate, excluded: false)
            update(&row)
            document.occurrenceOverrides.append(row)
        }
    }

    static func excludeOccurrence(_ document: inout CanonicalPlanningDocument, _ logicalID: String, _ occurrenceDate: String) {
        if let index = document.occurrenceOverrides.firstIndex(where: { $0.logicalID == logicalID && $0.occurrenceDate == occurrenceDate }) {
            document.occurrenceOverrides[index].excluded = true
        } else {
            document.occurrenceOverrides.append(CanonicalOccurrenceOverride(logicalID: logicalID, occurrenceDate: occurrenceDate, excluded: true))
        }
    }

    static func setCompleted(_ document: inout CanonicalPlanningDocument, _ logicalID: String, _ completed: Bool) {
        guard let index = document.payloads.firstIndex(where: { $0.id == logicalID }), document.payloads[index].kind == .task else { return }
        document.payloads[index].completed = completed
    }

    @discardableResult
    static func setEventCompletion(_ document: inout CanonicalPlanningDocument, _ logicalID: String, _ date: String, _ completed: Bool) -> Bool {
        guard let payload = document.payloads.first(where: { $0.id == logicalID }), payload.kind == .event, dayIsCovered(payload, date) else { return false }
        if let index = document.dayCompletions.firstIndex(where: { $0.logicalID == logicalID && $0.date == date }) {
            document.dayCompletions[index].completed = completed
            return true
        }
        document.dayCompletions.append(CanonicalDayCompletion(logicalID: logicalID, date: date, completed: completed))
        return true
    }

    static func pruneStaleDateOverrides(_ document: inout CanonicalPlanningDocument, _ logicalID: String) {
        guard let payload = document.payloads.first(where: { $0.id == logicalID }) else { return }
        document.occurrenceOverrides.removeAll { $0.logicalID == logicalID && !isScheduledStart(payload, $0.occurrenceDate) }
        document.dayCompletions.removeAll { $0.logicalID == logicalID && !dayIsCovered(payload, $0.date) }
        document.levelOverrides.removeAll { $0.logicalID == logicalID && !periodStillCovered(payload, $0.level, $0.periodKey) }
    }

    static func recordReflectionDecision(_ document: inout CanonicalPlanningDocument, _ decision: CanonicalReflectionDecision) -> Bool {
        let exists = document.reflectionDecisions.contains {
            $0.level == decision.level && $0.periodKey == decision.periodKey && $0.logicalID == decision.logicalID && $0.occurrenceDate == decision.occurrenceDate
        }
        guard !exists else { return false }
        document.reflectionDecisions.append(decision)
        return true
    }

    static func completeReflection(_ document: inout CanonicalPlanningDocument, _ id: String, _ decisionIDs: [String]) -> Bool {
        guard !document.reflectionSnapshots.contains(where: { $0.id == id }) else { return false }
        document.reflectionSnapshots.append(CanonicalReflectionSnapshot(id: id, completed: true, decisionIDs: decisionIDs))
        return true
    }

    static func calendarDays(_ document: CanonicalPlanningDocument, _ day: String) -> [CanonicalEffectiveItem] {
        effectiveItems(document, .daily, day)
    }

    struct LegacyImportStats {
        var inserted = 0
        var skipped = 0
        var unsupported = 0
        var deferred = 0
        var reconciliation = 0
        var exclusionsAdded = 0
        var overridesAdded = 0
    }

    struct LegacyPreflightSummary {
        var candidates = 0
        var importable = 0
        var alreadyImported = 0
        var deferred = 0
        var malformed = 0
        var reconciliation = 0
    }

    /// Counts series rows only. Does not write.
    static func summarizeLegacy(_ document: CanonicalPlanningDocument, _ records: [LegacyCalendarRecord]) -> LegacyPreflightSummary {
        let series = records.filter { $0.recurrenceMasterId == nil }
        let known = Set(series.map(\.id))
        var summary = LegacyPreflightSummary()
        summary.candidates = series.count
        summary.malformed = records.filter { record in
            guard let master = record.recurrenceMasterId else { return false }
            return !known.contains(master)
        }.count
        for row in series {
            let children = records.filter { $0.recurrenceMasterId == row.id }
            switch verdict(document, row, children) {
            case .fullySupported: summary.importable += 1
            case .alreadyImported: summary.alreadyImported += 1
            case .unsupportedOccurrenceChanges: summary.deferred += 1
            case .requiresReconciliation: summary.reconciliation += 1
            case .malformedSeries: summary.malformed += 1
            }
        }
        return summary
    }

    private enum SeriesVerdict {
        case fullySupported
        case unsupportedOccurrenceChanges
        case malformedSeries
        case alreadyImported
        case requiresReconciliation
    }

    private static func childUnsupported(_ series: LegacyCalendarRecord, _ child: LegacyCalendarRecord) -> Bool {
        let colorMismatch = child.color != nil && child.color != series.color
        let iconMismatch = child.icon != nil && child.icon != series.icon
        let allDayMismatch = child.allDay != nil && child.allDay != series.allDay
        let seriesEnd = series.endDate ?? series.date
        let childEnd = child.endDate ?? child.date
        let seriesSpan = spanDays(series.date, seriesEnd)
        let childSpan = spanDays(child.date, childEnd)
        let spanMismatch = childEnd < child.date || seriesEnd < series.date || childSpan != seriesSpan
        return colorMismatch || iconMismatch || allDayMismatch || spanMismatch
    }

    private static func verdict(
        _ document: CanonicalPlanningDocument,
        _ row: LegacyCalendarRecord,
        _ children: [LegacyCalendarRecord]
    ) -> SeriesVerdict {
        let exists = document.payloads.contains { $0.legacyWebID == row.id || $0.id == row.id }
        if children.contains(where: { $0.recurrenceDate == nil || childUnsupported(row, $0) }) {
            return exists ? .requiresReconciliation : .unsupportedOccurrenceChanges
        }
        return exists ? .alreadyImported : .fullySupported
    }

    /// Writes a series only when every one-day change fits. Does not rewrite an existing payload.
    static func importLegacy(_ document: inout CanonicalPlanningDocument, _ records: [LegacyCalendarRecord]) -> LegacyImportStats {
        var stats = LegacyImportStats()
        let series = records.filter { $0.recurrenceMasterId == nil }
        let known = Set(series.map(\.id))
        stats.unsupported = records.filter { record in
            guard let master = record.recurrenceMasterId else { return false }
            return !known.contains(master)
        }.count
        for row in series {
            let children = records.filter { $0.recurrenceMasterId == row.id }
            switch verdict(document, row, children) {
            case .unsupportedOccurrenceChanges:
                stats.deferred += 1
                continue
            case .requiresReconciliation:
                stats.reconciliation += 1
                continue
            case .malformedSeries:
                stats.unsupported += 1
                continue
            case .fullySupported:
                let frequency = CanonicalRepeatFrequency(rawValue: row.repeatFrequency ?? "none") ?? .none
                let created = createItem(&document, CanonicalCreateInput(
                    legacyWebID: row.id,
                    kind: .event,
                    origin: .daily,
                    originPeriodKey: row.date,
                    title: row.title,
                    iconSymbol: row.icon ?? "calendar",
                    colorID: row.color.flatMap { LegacyCalendarColorMap.resolved[$0] },
                    legacyColorKey: row.color,
                    location: row.location ?? "",
                    memo: row.notes ?? "",
                    allDay: row.allDay ?? false,
                    startDate: row.date,
                    endDate: row.endDate ?? row.date,
                    startMinutes: minutes(row.startTime),
                    endMinutes: minutes(row.endTime),
                    reminders: row.reminders ?? [],
                    recurrence: CanonicalRecurrenceRule(frequency: frequency, endDate: row.repeatEndDate),
                    liveActivity: row.liveActivity ?? false,
                    liveActivityLead: row.liveActivityLead,
                    updatedAt: row.updatedAt ?? ""
                ))
                if created != nil { stats.inserted += 1 } else { stats.unsupported += 1 }
            case .alreadyImported:
                stats.skipped += 1
            }
            guard let master = document.payloads.first(where: { $0.legacyWebID == row.id || $0.id == row.id }) else { continue }
            for child in children {
                guard let date = child.recurrenceDate else { continue }
                if document.occurrenceOverrides.contains(where: { $0.logicalID == master.id && $0.occurrenceDate == date }) { continue }
                editOccurrence(&document, master.id, date) { override in
                    if child.title != master.title { override.title = child.title }
                    if child.location != master.location { override.location = child.location }
                    if child.notes != master.memo { override.memo = child.notes }
                    override.startMinutes = minutes(child.startTime)
                    override.endMinutes = minutes(child.endTime)
                    if child.reminders != master.reminders { override.reminders = child.reminders }
                    override.liveActivity = child.liveActivity
                    override.liveActivityLead = child.liveActivityLead
                }
                stats.overridesAdded += 1
            }
            for date in row.excludeDates ?? [] {
                if children.contains(where: { $0.recurrenceDate == date }) { continue }
                if document.occurrenceOverrides.contains(where: { $0.logicalID == master.id && $0.occurrenceDate == date }) { continue }
                excludeOccurrence(&document, master.id, date)
                stats.exclusionsAdded += 1
            }
        }
        document.legacyMigration = "unresolved"
        return stats
    }

    private static func flows(_ kind: CanonicalPlanningKind, _ origin: CanonicalPlanningLevel, _ level: CanonicalPlanningLevel) -> Bool {
        let allowed: [CanonicalPlanningLevel]
        if kind == .task {
            switch origin {
            case .future: allowed = [.future]
            case .monthly: allowed = [.monthly, .weekly, .daily]
            case .weekly: allowed = [.weekly, .daily]
            case .daily: allowed = [.daily]
            }
        } else {
            switch origin {
            case .future: allowed = [.future, .monthly, .weekly, .daily]
            case .monthly: allowed = [.monthly, .weekly, .daily]
            case .weekly: allowed = [.weekly, .daily]
            case .daily: allowed = [.daily]
            }
        }
        return allowed.contains(level)
    }

    private static func tombstoned(_ document: CanonicalPlanningDocument, _ logicalID: String, _ level: CanonicalPlanningLevel, _ key: String) -> Bool {
        document.tombstones.contains { $0.logicalID == logicalID && $0.level == level && $0.periodKey == key }
    }

    private static func spanDays(_ start: String, _ end: String) -> Int {
        guard var cursor = CanonicalDate.parse(start), let last = CanonicalDate.parse(end) else { return 0 }
        var count = 0
        while cursor < last && count < 4000 {
            count += 1
            cursor = CanonicalPlanningCalendar.addDays(cursor, 1)
        }
        return count
    }

    private static func weekdayOccurrence(_ day: CanonicalDate) -> Int { ((day.day - 1) / 7) + 1 }

    private static func matchesMonthlyWeekday(_ start: CanonicalDate, _ target: CanonicalDate) -> Bool {
        guard let startDate = CanonicalPlanningCalendar.date(start), let targetDate = CanonicalPlanningCalendar.date(target) else { return false }
        let calendar = CanonicalPlanningCalendar.calendar
        guard calendar.component(.weekday, from: startDate) == calendar.component(.weekday, from: targetDate) else { return false }
        let want = weekdayOccurrence(start)
        let got = weekdayOccurrence(target)
        if got == want { return true }
        if want >= 5 {
            let next = CanonicalPlanningCalendar.addDays(target, 7)
            return next.month != target.month
        }
        return false
    }

    private static func matches(_ start: CanonicalDate, _ cursor: CanonicalDate, _ frequency: CanonicalRepeatFrequency) -> Bool {
        switch frequency {
        case .none: return start == cursor
        case .daily: return true
        case .weekly:
            guard let left = CanonicalPlanningCalendar.date(start), let right = CanonicalPlanningCalendar.date(cursor) else { return false }
            return CanonicalPlanningCalendar.calendar.component(.weekday, from: left) == CanonicalPlanningCalendar.calendar.component(.weekday, from: right)
        case .monthly: return cursor.day == start.day
        case .monthlyWeekday: return matchesMonthlyWeekday(start, cursor)
        case .yearly: return cursor.month == start.month && cursor.day == start.day
        }
    }

    /// Editor gate from the WebView. A stored rule that fails this check is still projected.
    static func repeatAllowedForSpan(_ start: String, _ end: String, _ frequency: CanonicalRepeatFrequency) -> Bool {
        repeatAllowed(start, end, frequency)
    }

    private static func repeatAllowed(_ start: String, _ end: String, _ frequency: CanonicalRepeatFrequency) -> Bool {
        let span = spanDays(start, end)
        if frequency == .daily && span >= 1 { return false }
        if frequency == .weekly && span >= 7 { return false }
        return true
    }

    private static func occurrenceStarts(_ payload: CanonicalPayload) -> [String] {
        guard let startKey = payload.startDate else { return [] }
        let endKey = payload.endDate ?? startKey
        guard endKey >= startKey else { return [] }
        let frequency = payload.recurrence.frequency
        if frequency == .none { return [startKey] }
        guard let start = CanonicalDate.parse(startKey) else { return [] }
        let limitKey = payload.recurrence.endDate ?? CanonicalPlanningCalendar.addDays(start, CanonicalPlanningCalendar.horizonDays).key
        guard var cursor = CanonicalDate.parse(startKey), let limit = CanonicalDate.parse(limitKey) else { return [] }
        var starts: [String] = []
        while cursor <= limit && starts.count < CanonicalPlanningCalendar.horizonDays {
            if matches(start, cursor, frequency) { starts.append(cursor.key) }
            cursor = CanonicalPlanningCalendar.addDays(cursor, 1)
        }
        return starts
    }

    static func isScheduledStart(_ payload: CanonicalPayload, _ date: String) -> Bool {
        guard let startKey = payload.startDate, date >= startKey else { return false }
        let endKey = payload.endDate ?? startKey
        guard endKey >= startKey else { return false }
        if payload.recurrence.frequency == .none { return date == startKey }
        if let limit = payload.recurrence.endDate, date > limit { return false }
        guard let start = CanonicalDate.parse(startKey), let cursor = CanonicalDate.parse(date) else { return false }
        return matches(start, cursor, payload.recurrence.frequency)
    }

    static func instancesCovering(_ payload: CanonicalPayload, _ day: String) -> [String] {
        guard let startKey = payload.startDate, let dayDate = CanonicalDate.parse(day) else { return [] }
        let endKey = payload.endDate ?? startKey
        guard endKey >= startKey else { return [] }
        if payload.recurrence.frequency == .none {
            return day >= startKey && day <= endKey ? [startKey] : []
        }
        let span = spanDays(startKey, endKey)
        var cursor = CanonicalPlanningCalendar.addDays(dayDate, -span)
        if let start = CanonicalDate.parse(startKey), cursor < start { cursor = start }
        var starts: [String] = []
        while cursor.key <= day {
            if isScheduledStart(payload, cursor.key) { starts.append(cursor.key) }
            cursor = CanonicalPlanningCalendar.addDays(cursor, 1)
        }
        return starts
    }

    static func dayIsCovered(_ payload: CanonicalPayload, _ day: String) -> Bool {
        !instancesCovering(payload, day).isEmpty
    }

    private static func periodStillCovered(_ payload: CanonicalPayload, _ level: CanonicalPlanningLevel, _ key: String) -> Bool {
        guard payload.startDate != nil else { return level == payload.origin && key == payload.originPeriodKey }
        switch level {
        case .daily:
            return dayIsCovered(payload, key)
        case .weekly:
            guard let start = CanonicalDate.parse(key) else { return true }
            return (0..<7).contains { offset in dayIsCovered(payload, CanonicalPlanningCalendar.addDays(start, offset).key) }
        case .monthly:
            let pieces = key.split(separator: "-")
            guard pieces.count == 2, let year = Int(pieces[0]), let month = Int(pieces[1]) else { return true }
            let count = CanonicalPlanningCalendar.calendar.range(of: .day, in: .month, for: CanonicalPlanningCalendar.calendar.date(from: DateComponents(year: year, month: month, day: 1)) ?? Date())?.count ?? 28
            return (1...count).contains { day in dayIsCovered(payload, String(format: "%04d-%02d-%02d", year, month, day)) }
        case .future:
            guard let year = Int(key) else { return true }
            return (1...12).contains { month in periodStillCovered(payload, .monthly, String(format: "%04d-%02d", year, month)) }
        }
    }

    private static func coveredDates(_ document: CanonicalPlanningDocument, _ payload: CanonicalPayload) -> [(date: String, occurrenceDate: String)] {
        guard let startKey = payload.startDate else { return [] }
        let endKey = payload.endDate ?? startKey
        guard endKey >= startKey else { return [] }
        let length = spanDays(startKey, payload.endDate ?? startKey)
        var rows: [(date: String, occurrenceDate: String)] = []
        for start in occurrenceStarts(payload) {
            if document.occurrenceOverrides.contains(where: { $0.logicalID == payload.id && $0.occurrenceDate == start && $0.excluded }) { continue }
            guard var cursor = CanonicalDate.parse(start) else { continue }
            for _ in 0...length {
                rows.append((cursor.key, start))
                cursor = CanonicalPlanningCalendar.addDays(cursor, 1)
            }
        }
        return rows
    }

    private static func minutes(_ clock: String?) -> Int? {
        guard let clock else { return nil }
        let pieces = clock.split(separator: ":")
        guard pieces.count == 2, let hour = Int(pieces[0]), let minute = Int(pieces[1]) else { return nil }
        return hour * 60 + minute
    }
}

enum CanonicalPlanningPersistence {
    static let storageKey = "essences.canonical-planning.v1"

    enum LoadResult {
        case absent
        case loaded(CanonicalPlanningDocument)
        case unreadable
    }

    static func save(_ document: CanonicalPlanningDocument, defaults: UserDefaults = .standard) {
        guard let data = try? JSONEncoder().encode(document) else { return }
        defaults.set(data, forKey: storageKey)
    }

    static func load(defaults: UserDefaults = .standard) -> LoadResult {
        guard let data = defaults.data(forKey: storageKey) else { return .absent }
        guard let document = try? JSONDecoder().decode(CanonicalPlanningDocument.self, from: data),
              document.schemaVersion == CanonicalPlanningDocument.schemaVersion else { return .unreadable }
        return .loaded(document)
    }

    /// Explicit `isSample` rows only. A matching title is not enough to drop a record.
    static func productionDocument(_ document: CanonicalPlanningDocument) -> CanonicalPlanningDocument {
        let sampleIDs = Set(document.payloads.filter(\.isSample).map(\.id))
        var copy = document
        copy.legacyMigration = "unresolved"
        copy.payloads = document.payloads.filter { !$0.isSample }
        copy.tombstones = document.tombstones.filter { !sampleIDs.contains($0.logicalID) }
        copy.levelOverrides = document.levelOverrides.filter { !sampleIDs.contains($0.logicalID) }
        copy.occurrenceOverrides = document.occurrenceOverrides.filter { !sampleIDs.contains($0.logicalID) }
        copy.dayCompletions = document.dayCompletions.filter { !sampleIDs.contains($0.logicalID) }
        copy.reflectionSnapshots = productionReflectionSnapshots(document, sampleIDs: sampleIDs)
        copy.reflectionDecisions = document.reflectionDecisions.filter { !$0.isSample && !sampleIDs.contains($0.logicalID) }
        return copy
    }

    /// Sample-only when every decision id is a payload still marked `isSample`.
    /// Mixed snapshots keep the other ids. Empty or unknown ids stay.
    private static func productionReflectionSnapshots(
        _ document: CanonicalPlanningDocument,
        sampleIDs: Set<String>
    ) -> [CanonicalReflectionSnapshot] {
        document.reflectionSnapshots.compactMap { row in
            let decisionIDs = row.decisionIDs.filter { !sampleIDs.contains($0) }
            if !row.decisionIDs.isEmpty && decisionIDs.isEmpty { return nil }
            return CanonicalReflectionSnapshot(id: row.id, completed: row.completed, decisionIDs: decisionIDs)
        }
    }

    static func isProductionEmpty(_ document: CanonicalPlanningDocument) -> Bool {
        let produced = productionDocument(document)
        return produced.payloads.isEmpty
            && produced.tombstones.isEmpty
            && produced.levelOverrides.isEmpty
            && produced.occurrenceOverrides.isEmpty
            && produced.dayCompletions.isEmpty
            && produced.reflectionSnapshots.isEmpty
            && produced.reflectionDecisions.isEmpty
    }
}

/// Loaded beside `PlanningSession`. Screens do not read it yet.
@MainActor
final class CanonicalPlanningController {
    enum HoldState {
        case absent
        case loaded
        case unreadable
    }

    private(set) var state: HoldState
    private(set) var document: CanonicalPlanningDocument
    private let defaults: UserDefaults
    private var lastWritten: Data?

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        switch CanonicalPlanningPersistence.load(defaults: defaults) {
        case .absent:
            state = .absent
            document = .empty()
        case .unreadable:
            state = .unreadable
            document = .empty()
        case .loaded(let loaded):
            state = .loaded
            document = loaded
            lastWritten = try? JSONEncoder().encode(CanonicalPlanningPersistence.productionDocument(loaded))
        }
    }

    /// Writes only when the production snapshot changes. Never replaces unreadable bytes.
    @discardableResult
    func mutate(_ change: (inout CanonicalPlanningDocument) -> Void) -> Bool {
        guard state != .unreadable else { return false }
        change(&document)
        document.legacyMigration = "unresolved"
        let produced = CanonicalPlanningPersistence.productionDocument(document)
        if state == .absent && CanonicalPlanningPersistence.isProductionEmpty(produced) { return false }
        guard let encoded = try? JSONEncoder().encode(produced), encoded != lastWritten else { return false }
        defaults.set(encoded, forKey: CanonicalPlanningPersistence.storageKey)
        lastWritten = encoded
        state = .loaded
        return true
    }
}

enum LegacyWebViewCalendarAccess {
    /// WebView records live in WKWebView LevelDB (`essences-app-data-v3`, leftover `calendar-events`).
    /// `AppDelegate` installs `NativeAppRoot` and does not create that web view.
    /// Swift cannot decode that store. This probe does not write an empty calendar or delete legacy data.
    static func probeLegacyWebViewCalendar() -> String { "unresolved" }
}
