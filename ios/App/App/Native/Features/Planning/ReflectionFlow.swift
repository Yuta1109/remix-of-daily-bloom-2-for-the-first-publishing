import Foundation

enum ReflectionScope: Hashable {
    case period(PlanningBucket, String)
    case future(Int)

    var section: PlanningSection {
        switch self {
        case .period(let bucket, _): bucket.section
        case .future: .future
        }
    }
}

enum PlanningMemoryKind: String, Hashable {
    case photoNote
    case diary
}

enum PhotoMemoryAspectRatio: String, Hashable, CaseIterable, Identifiable {
    case landscape
    case portrait
    case square

    var id: String { rawValue }

    /// Older records that never stored a ratio restore as 4:3.
    static func restored(_ stored: String?) -> PhotoMemoryAspectRatio {
        guard let stored, let ratio = PhotoMemoryAspectRatio(rawValue: stored) else { return .landscape }
        return ratio
    }

    var label: String {
        switch self {
        case .landscape: "4:3"
        case .portrait: "3:4"
        case .square: "1:1"
        }
    }

    var overlayAssetName: String {
        switch self {
        case .landscape: "photo_memory_overlay_4x3"
        case .portrait: "photo_memory_overlay_3x4"
        case .square: "photo_memory_overlay_1x1"
        }
    }

    /// Width divided by the overlay image height, so the PNG is never stretched.
    var overlayWidthOverHeight: CGFloat {
        switch self {
        case .landscape: 1402.0 / 1122.0
        case .portrait: 1122.0 / 1402.0
        case .square: 1
        }
    }

    /// Normalized photo aperture inside the overlay. Values are fractions of the overlay.
    var aperture: (minX: CGFloat, maxX: CGFloat, minY: CGFloat, maxY: CGFloat) {
        switch self {
        case .landscape: (0.222, 0.776, 0.330, 0.766)
        case .portrait: (0.262, 0.736, 0.300, 0.793)
        case .square: (0.250, 0.750, 0.315, 0.796)
        }
    }

    /// Width divided by height.
    var widthOverHeight: CGFloat {
        switch self {
        case .landscape: 4.0 / 3.0
        case .portrait: 3.0 / 4.0
        case .square: 1
        }
    }

    /// Share of the editor content width used by the picker preview.
    var editorWidthFraction: CGFloat {
        switch self {
        case .landscape: 1
        case .portrait: 0.74
        case .square: 0.84
        }
    }

    /// Visible ivory frame as fractions of the overlay canvas, measured from the PNG alpha.
    var visibleFrame: (minX: CGFloat, maxX: CGFloat, minY: CGFloat, maxY: CGFloat) {
        switch self {
        case .landscape: (0.084, 0.919, 0.198, 0.925)
        case .portrait: (0.107, 0.893, 0.180, 0.910)
        case .square: (0.104, 0.896, 0.182, 0.935)
        }
    }

    /// Target width of the visible outer frame, as a share of the usable period body.
    var targetVisibleFrameFraction: CGFloat {
        switch self {
        case .landscape: 0.89
        case .portrait: 0.755
        case .square: 0.815
        }
    }

    var visibleFrameCap: CGFloat {
        switch self {
        case .landscape: 318
        case .portrait: 272
        case .square: 292
        }
    }

    /// Overlay canvas width that makes the visible frame hit the target. Not the PNG width itself.
    func overlayWidth(usableBody: CGFloat) -> CGFloat {
        let frameWidth = min(usableBody * targetVisibleFrameFraction, visibleFrameCap)
        let span = max(visibleFrame.maxX - visibleFrame.minX, 0.01)
        return frameWidth / span
    }
}

enum DailyAttentionRules {
    static func unresolvedKeys(reflections: Set<String>, photoKey: String, photoResolvedKey: String, diaryKey: String, diaryResolvedKey: String) -> Set<String> {
        var keys = reflections
        if !photoKey.isEmpty, photoResolvedKey != photoKey { keys.insert(photoKey) }
        if !diaryKey.isEmpty, diaryResolvedKey != diaryKey { keys.insert(diaryKey) }
        return keys
    }

    static func showsLeft(_ keys: Set<String>, current: String) -> Bool {
        keys.contains { $0.compare(current, options: .numeric) == .orderedAscending }
    }

    static func showsRight(_ keys: Set<String>, current: String) -> Bool {
        keys.contains { $0.compare(current, options: .numeric) == .orderedDescending }
    }

    static func badgeCount(_ keys: Set<String>) -> Int {
        min(99, keys.count)
    }
}

/// Persisted Daily tutorial attention. Separate from the sample memories themselves.
struct DailyTutorialProgress: Hashable {
    var anchorKey = ""
    var reflectionTutorialKey = ""
    var photoTutorialKey = ""
    var diaryTutorialKey = ""
    /// Resolved only when this string equals the registered tutorial key.
    var resolvedPhotoTutorialKey = ""
    var resolvedDiaryTutorialKey = ""

    var photoResolved: Bool { !photoTutorialKey.isEmpty && resolvedPhotoTutorialKey == photoTutorialKey }
    var diaryResolved: Bool { !diaryTutorialKey.isEmpty && resolvedDiaryTutorialKey == diaryTutorialKey }

    /// Legacy opened-booleans are ignored. A flag without this period key must not clear the cue.
    static func restored(from defaults: UserDefaults = .standard) -> DailyTutorialProgress {
        DailyTutorialProgress(
            anchorKey: defaults.string(forKey: "planning.tutorial.anchor") ?? "",
            reflectionTutorialKey: defaults.string(forKey: "planning.tutorial.reflectionKey") ?? "",
            photoTutorialKey: defaults.string(forKey: "planning.tutorial.photoKey") ?? "",
            diaryTutorialKey: defaults.string(forKey: "planning.tutorial.diaryKey") ?? "",
            resolvedPhotoTutorialKey: defaults.string(forKey: "planning.tutorial.resolvedPhotoKey") ?? "",
            resolvedDiaryTutorialKey: defaults.string(forKey: "planning.tutorial.resolvedDiaryKey") ?? ""
        )
    }

    func store(into defaults: UserDefaults = .standard) {
        defaults.set(anchorKey, forKey: "planning.tutorial.anchor")
        defaults.set(reflectionTutorialKey, forKey: "planning.tutorial.reflectionKey")
        defaults.set(photoTutorialKey, forKey: "planning.tutorial.photoKey")
        defaults.set(diaryTutorialKey, forKey: "planning.tutorial.diaryKey")
        defaults.set(resolvedPhotoTutorialKey, forKey: "planning.tutorial.resolvedPhotoKey")
        defaults.set(resolvedDiaryTutorialKey, forKey: "planning.tutorial.resolvedDiaryKey")
    }
}

struct PlanningMemoryEntry: Identifiable, Hashable {
    var id = UUID()
    var scope: ReflectionScope
    var kind: PlanningMemoryKind
    var text: String
    var hasPhoto: Bool
    var title: String = ""
    var dateText: String = ""
    var imageData: Data? = nil
    var photoAspect: PhotoMemoryAspectRatio = .landscape
    var saved = false
    /// Temporary local sample. Not a production account record.
    var isSample = false
}

struct ReflectionSchedule: Hashable {
    var dailyHour = 17
    var dailyUsesNextDay = false
    var weeklyWeekday = 1
    var monthlyUsesStart = false
    var futureMonth = 12
    var futureDay = 31
}

struct StoredReflectionDecision: Identifiable, Hashable {
    var itemID: UUID
    var logicalID: UUID
    var title: String
    var kind: PlanningItemKind
    var completed: Bool
    var disposition: ReflectionDisposition
    var eventID: UUID?
    var todayTaskID: UUID?

    var id: UUID { itemID }
}

struct ReflectionItem: Identifiable, Hashable {
    var id: UUID
    var logicalID: UUID
    var title: String
    var kind: PlanningItemKind
    var completed: Bool
    var eventID: UUID?
    var todayTaskID: UUID?
    var nodeID: UUID?
}

struct ReflectionDraft {
    var scope: ReflectionScope
    var started = false
    var decisions: [UUID: ReflectionDisposition] = [:]
}

struct FutureReflectionRecord: Identifiable, Hashable {
    var year: Int
    var hasMeaningfulActivity: Bool
    var reflectionOutstanding: Bool
    var reflectionCompleted: Bool
    var skipped = false
    var completedAt: Date?
    var decisions: [StoredReflectionDecision] = []

    var id: Int { year }
}

enum ReflectionEditWindow {
    static func limit(for bucket: PlanningBucket) -> Int {
        switch bucket {
        case .daily: 7
        case .weekly: 4
        case .monthly: 1
        }
    }
}

enum ReflectionRules {
    static let historyLimit = 5

    static func isEligible(hasMeaningfulActivity: Bool) -> Bool {
        hasMeaningfulActivity
    }

    static func isActivePrompt(hasMeaningfulActivity: Bool, due: Bool, completed: Bool, skipped: Bool) -> Bool {
        hasMeaningfulActivity && due && !completed && !skipped
    }

    static func history<T>(_ entries: [T], completed: (T) -> Bool, date: (T) -> Date?) -> [T] {
        Array(entries.filter { completed($0) && date($0) != nil }.sorted { (date($0) ?? .distantPast) > (date($1) ?? .distantPast) }.prefix(historyLimit))
    }
}

extension PlanningSession {
    func reflectionBadgeUnits(for section: PlanningSection) -> Int {
        if section == .future {
            return futureReflections.reduce(0) {
                $0 + PeriodCalendar.periodBadge(
                    hasMeaningfulActivity: $1.hasMeaningfulActivity,
                    outstanding: $1.reflectionOutstanding,
                    completed: $1.reflectionCompleted,
                    skipped: $1.skipped
                )
            }
        }
        return periodRecords.reduce(0) { partial, record in
            guard record.bucket.section == section else { return partial }
            return partial + PeriodCalendar.periodBadge(
                hasMeaningfulActivity: record.hasMeaningfulActivity,
                outstanding: record.reflectionOutstanding,
                completed: record.reflectionCompleted,
                skipped: record.skipped
            )
        }
    }

    func refreshDue(_ scope: ReflectionScope, now: Date = Date()) {
        let due = isDue(scope, now: now)
        switch scope {
        case .period(let bucket, let key):
            var record = existingRecord(bucket: bucket, periodKey: key)
            record.reflectionOutstanding = ReflectionRules.isActivePrompt(
                hasMeaningfulActivity: record.hasMeaningfulActivity,
                due: due,
                completed: record.reflectionCompleted,
                skipped: record.skipped
            )
            store(record)
        case .future(let year):
            var record = futureRecord(year)
            record.hasMeaningfulActivity = futureHasActivity(year)
            record.reflectionOutstanding = ReflectionRules.isActivePrompt(
                hasMeaningfulActivity: record.hasMeaningfulActivity,
                due: due,
                completed: record.reflectionCompleted,
                skipped: record.skipped
            )
            storeFuture(record)
        }
    }

    func isDue(_ scope: ReflectionScope, now: Date = Date()) -> Bool {
        let calendar = PeriodCalendar.calendar
        switch scope {
        case .period(.daily, let key):
            guard let day = PeriodCalendar.date(from: key) else { return false }
            if reflectionSchedule.dailyUsesNextDay {
                let next = calendar.date(byAdding: .day, value: 1, to: day) ?? day
                return now >= date(next, hour: reflectionSchedule.dailyHour)
            }
            return now >= date(day, hour: reflectionSchedule.dailyHour)
        case .period(.weekly, let key):
            guard let start = PeriodCalendar.date(from: key) else { return false }
            let weekday = reflectionSchedule.weeklyWeekday
            let delta = (weekday - calendar.component(.weekday, from: start) + 7) % 7
            let dueDay = calendar.date(byAdding: .day, value: delta, to: start) ?? start
            return now >= calendar.startOfDay(for: dueDay)
        case .period(.monthly, let key):
            let parts = PeriodCalendar.monthParts(key)
            let start = calendar.date(from: DateComponents(year: parts.year, month: parts.month, day: 1)) ?? now
            if reflectionSchedule.monthlyUsesStart {
                return now >= start
            }
            let next = calendar.date(byAdding: .month, value: 1, to: start) ?? start
            let end = calendar.date(byAdding: .day, value: -1, to: next) ?? start
            return now >= calendar.startOfDay(for: end)
        case .future(let year):
            let due = calendar.date(from: DateComponents(year: year, month: reflectionSchedule.futureMonth, day: reflectionSchedule.futureDay)) ?? now
            return now >= due
        }
    }

    /// The arrow cue follows the destination period, and only a completed Reflection clears it.
    func hasUnresolvedReflection(bucket: PlanningBucket, periodKey: String, now: Date = Date()) -> Bool {
        if isDailyMemoryDemo(bucket: bucket, periodKey: periodKey) { return false }
        let record = existingRecord(bucket: bucket, periodKey: periodKey)
        return ReflectionRules.isActivePrompt(
            hasMeaningfulActivity: record.hasMeaningfulActivity,
            due: isDue(ReflectionScope.period(bucket, periodKey), now: now),
            completed: record.reflectionCompleted,
            skipped: record.skipped
        )
    }

    /// True when any unresolved attention item sits strictly before or after the current period.
    func directionHasAttention(bucket: PlanningBucket, from key: String, direction: Int, now: Date = Date()) -> Bool {
        guard direction != 0 else { return false }
        let keys = Set(attentionPeriodKeys(bucket: bucket, now: now))
        return direction < 0
            ? DailyAttentionRules.showsLeft(keys, current: key)
            : DailyAttentionRules.showsRight(keys, current: key)
    }

    func attentionPeriodKeys(bucket: PlanningBucket, now: Date = Date()) -> [String] {
        var reflections = Set<String>()
        for record in periodRecords where record.bucket == bucket {
            if hasUnresolvedReflection(bucket: bucket, periodKey: record.periodKey, now: now) {
                reflections.insert(record.periodKey)
            }
        }
        guard bucket == .daily else { return Array(reflections) }
        let keys = DailyAttentionRules.unresolvedKeys(
            reflections: reflections,
            photoKey: dailyTutorial.photoTutorialKey,
            photoResolvedKey: dailyTutorial.resolvedPhotoTutorialKey,
            diaryKey: dailyTutorial.diaryTutorialKey,
            diaryResolvedKey: dailyTutorial.resolvedDiaryTutorialKey
        )
        return Array(keys)
    }

    func markPhotoTutorialOpened(periodKey: String) {
        guard periodKey == dailyTutorial.photoTutorialKey, !periodKey.isEmpty else { return }
        guard dailyTutorial.resolvedPhotoTutorialKey != periodKey else { return }
        dailyTutorial.resolvedPhotoTutorialKey = periodKey
        dailyTutorial.store()
    }

    func markDiaryTutorialOpened(periodKey: String) {
        guard periodKey == dailyTutorial.diaryTutorialKey, !periodKey.isEmpty else { return }
        guard dailyTutorial.resolvedDiaryTutorialKey != periodKey else { return }
        dailyTutorial.resolvedDiaryTutorialKey = periodKey
        dailyTutorial.store()
    }

    /// Keeps the first registered tutorial anchor. Later launches do not move the keys.
    func registerDailyTutorialPeriods(anchorKey: String, reflectionKey: String, photoKey: String, diaryKey: String) {
        guard dailyTutorial.anchorKey.isEmpty else { return }
        dailyTutorial.anchorKey = anchorKey
        dailyTutorial.reflectionTutorialKey = reflectionKey
        dailyTutorial.photoTutorialKey = photoKey
        dailyTutorial.diaryTutorialKey = diaryKey
        dailyTutorial.store()
    }

    func setMemoryAspect(id: UUID, photoAspect: PhotoMemoryAspectRatio) {
        guard let index = memoryEntries.firstIndex(where: { $0.id == id }) else { return }
        memoryEntries[index].photoAspect = photoAspect
    }

    func replaceMemoryPhoto(id: UUID, imageData: Data) {
        guard let index = memoryEntries.firstIndex(where: { $0.id == id }) else { return }
        memoryEntries[index].imageData = imageData
        memoryEntries[index].hasPhoto = true
    }

    private func isDailyMemoryDemo(bucket: PlanningBucket, periodKey: String) -> Bool {
        guard bucket == .daily else { return false }
        let record = existingRecord(bucket: bucket, periodKey: periodKey)
        guard !record.hasMeaningfulActivity else { return false }
        let scope = ReflectionScope.period(bucket, periodKey)
        return memoryEntries.contains { entry in
            entry.scope == scope && entry.saved && (entry.kind == .photoNote || entry.kind == .diary)
        }
    }

    func isActivePrompt(_ scope: ReflectionScope, now: Date = Date()) -> Bool {
        switch scope {
        case .period(let bucket, let key):
            let record = existingRecord(bucket: bucket, periodKey: key)
            return ReflectionRules.isActivePrompt(
                hasMeaningfulActivity: record.hasMeaningfulActivity,
                due: isDue(scope, now: now),
                completed: record.reflectionCompleted,
                skipped: record.skipped
            )
        case .future(let year):
            let record = futureRecord(year)
            return ReflectionRules.isActivePrompt(
                hasMeaningfulActivity: futureHasActivity(year),
                due: isDue(scope, now: now),
                completed: record.reflectionCompleted,
                skipped: record.skipped
            )
        }
    }

    func skipReflection(_ scope: ReflectionScope) {
        switch scope {
        case .period(let bucket, let key):
            var record = existingRecord(bucket: bucket, periodKey: key)
            record.skipped = true
            record.reflectionOutstanding = false
            record.reflectionCompleted = false
            store(record)
        case .future(let year):
            var record = futureRecord(year)
            record.skipped = true
            record.reflectionOutstanding = false
            record.reflectionCompleted = false
            storeFuture(record)
        }
        if reflectionDraft?.scope == scope {
            reflectionDraft = nil
        }
    }

    func beginReflection(_ scope: ReflectionScope) {
        var draft = reflectionDraft ?? ReflectionDraft(scope: scope)
        draft.scope = scope
        draft.started = true
        reflectionDraft = draft
    }

    func setDraftDecision(itemID: UUID, disposition: ReflectionDisposition) {
        guard var draft = reflectionDraft else { return }
        draft.decisions[itemID] = disposition
        reflectionDraft = draft
    }

    func reflectionItems(_ scope: ReflectionScope) -> [ReflectionItem] {
        switch scope {
        case .period(let bucket, let key):
            return flattened(nodes(bucket: bucket, periodKey: key, kind: .task) + nodes(bucket: bucket, periodKey: key, kind: .event))
        case .future(let year):
            var items: [ReflectionItem] = events.filter { $0.year == year }.map { event in
                ReflectionItem(
                    id: event.id,
                    logicalID: event.sourceEventID ?? event.id,
                    title: event.title,
                    kind: .event,
                    completed: false,
                    eventID: event.id
                )
            }
            if let yearModel = years.first(where: { $0.year == year }) {
                items.append(contentsOf: yearModel.months.filter { !$0.goal.isEmpty }.map { month in
                    ReflectionItem(
                        id: month.goalItemID,
                        logicalID: month.goalItemID,
                        title: month.goal,
                        kind: .task,
                        completed: false
                    )
                })
            }
            return items
        }
    }

    func canCompleteReflection(_ scope: ReflectionScope) -> Bool {
        let items = reflectionItems(scope)
        guard let draft = reflectionDraft, draft.scope == scope, draft.started else { return false }
        return items.allSatisfy { draft.decisions[$0.id] != nil }
    }

    func completeReflection(scope: ReflectionScope, now: Date = Date()) -> Bool {
        guard canCompleteReflection(scope), let draft = reflectionDraft else { return false }
        let items = reflectionItems(scope)
        let stored = items.map { item in
            StoredReflectionDecision(
                itemID: item.id,
                logicalID: item.logicalID,
                title: item.title,
                kind: item.kind,
                completed: item.completed,
                disposition: draft.decisions[item.id] ?? .stop,
                eventID: item.eventID,
                todayTaskID: item.todayTaskID
            )
        }
        for decision in stored {
            writeDisposition(decision, scope: scope)
            if decision.disposition == .postpone {
                ensurePostpone(decision, scope: scope)
            }
            if decision.disposition == .keep, !keptAncestor(of: decision, among: stored, scope: scope) {
                ensureContinuation(decision, scope: scope)
            }
        }
        switch scope {
        case .period(let bucket, let key):
            var record = existingRecord(bucket: bucket, periodKey: key)
            record.decisions = stored
            record.reflectionCompleted = true
            record.reflectionOutstanding = false
            record.completedAt = now
            record.explicitEdit = false
            store(record)
        case .future(let year):
            var record = futureRecord(year)
            record.decisions = stored
            record.hasMeaningfulActivity = true
            record.reflectionCompleted = true
            record.reflectionOutstanding = false
            record.completedAt = now
            storeFuture(record)
        }
        reflectionDraft = nil
        return true
    }

    func updateHistoricalDecision(scope: ReflectionScope, itemID: UUID, disposition: ReflectionDisposition) {
        switch scope {
        case .period(let bucket, let key):
            var record = existingRecord(bucket: bucket, periodKey: key)
            guard let index = record.decisions.firstIndex(where: { $0.itemID == itemID }) else { return }
            let previous = record.decisions[index].disposition
            record.decisions[index].disposition = disposition
            apply(record.decisions[index], scope: scope, previous: previous)
            store(record)
        case .future(let year):
            var record = futureRecord(year)
            guard let index = record.decisions.firstIndex(where: { $0.itemID == itemID }) else { return }
            let previous = record.decisions[index].disposition
            record.decisions[index].disposition = disposition
            apply(record.decisions[index], scope: scope, previous: previous)
            storeFuture(record)
        }
    }

    /// Latest completed reflections only. Older completed records stay viewable and are not editable.
    func editableReflections(bucket: PlanningBucket) -> [ReflectionScope] {
        let limit = ReflectionEditWindow.limit(for: bucket)
        let rows = periodRecords
            .filter { $0.bucket == bucket && $0.reflectionCompleted && $0.completedAt != nil }
            .sorted { ($0.completedAt ?? .distantPast) > ($1.completedAt ?? .distantPast) }
        return rows.prefix(limit).map { .period($0.bucket, $0.periodKey) }
    }

    func reflectionIsEditable(_ scope: ReflectionScope) -> Bool {
        switch scope {
        case .period(let bucket, _):
            editableReflections(bucket: bucket).contains(scope)
        case .future:
            false
        }
    }

    func completedHistory(for section: PlanningSection) -> [ReflectionScope] {
        if section == .future {
            let rows = ReflectionRules.history(futureReflections, completed: \.reflectionCompleted, date: \.completedAt)
            return rows.map { .future($0.year) }
        }
        let bucket: PlanningBucket?
        switch section {
        case .monthly: bucket = .monthly
        case .weekly: bucket = .weekly
        case .daily: bucket = .daily
        default: bucket = nil
        }
        guard let bucket else { return [] }
        let rows = ReflectionRules.history(
            periodRecords.filter { $0.bucket == bucket },
            completed: \.reflectionCompleted,
            date: \.completedAt
        )
        return rows.map { .period($0.bucket, $0.periodKey) }
    }

    func reflectionIsSample(_ scope: ReflectionScope) -> Bool {
        switch scope {
        case .period(let bucket, let key):
            existingRecord(bucket: bucket, periodKey: key).isSample
        case .future:
            false
        }
    }

    func decisions(for scope: ReflectionScope) -> [StoredReflectionDecision] {
        switch scope {
        case .period(let bucket, let key):
            existingRecord(bucket: bucket, periodKey: key).decisions
        case .future(let year):
            futureRecord(year).decisions
        }
    }

    /// Counts from the stored Reflection snapshot, not the live task list.
    func classificationCounts(for scope: ReflectionScope) -> (keep: Int, postpone: Int, stop: Int) {
        let rows = decisions(for: scope)
        return (
            rows.filter { $0.disposition == .keep }.count,
            rows.filter { $0.disposition == .postpone }.count,
            rows.filter { $0.disposition == .stop }.count
        )
    }

    func snapshotCompletion(for scope: ReflectionScope) -> (todoDone: Int, todoTotal: Int, eventDone: Int, eventTotal: Int) {
        let rows = decisions(for: scope)
        let todos = rows.filter { $0.kind == .task }
        let events = rows.filter { $0.kind == .event }
        return (
            todos.filter(\.completed).count,
            todos.count,
            events.filter(\.completed).count,
            events.count
        )
    }

    func addMemory(scope: ReflectionScope, kind: PlanningMemoryKind, text: String, hasPhoto: Bool, title: String = "", dateText: String = "", imageData: Data? = nil, photoAspect: PhotoMemoryAspectRatio = .landscape, saved: Bool = false, isSample: Bool = false) {
        memoryEntries.append(
            PlanningMemoryEntry(
                scope: scope,
                kind: kind,
                text: text,
                hasPhoto: hasPhoto,
                title: title,
                dateText: dateText,
                imageData: imageData,
                photoAspect: photoAspect,
                saved: saved,
                isSample: isSample
            )
        )
    }

    func saveMemory(id: UUID) {
        guard let index = memoryEntries.firstIndex(where: { $0.id == id }) else { return }
        memoryEntries[index].saved = true
    }

    func updateMemory(id: UUID, text: String, title: String, dateText: String, hasPhoto: Bool, imageData: Data? = nil, photoAspect: PhotoMemoryAspectRatio? = nil) {
        guard let index = memoryEntries.firstIndex(where: { $0.id == id }) else { return }
        memoryEntries[index].text = text
        memoryEntries[index].title = title
        memoryEntries[index].dateText = dateText
        memoryEntries[index].hasPhoto = hasPhoto
        if let imageData { memoryEntries[index].imageData = imageData }
        if let photoAspect { memoryEntries[index].photoAspect = photoAspect }
    }

    func isExplicitEdit(bucket: PlanningBucket, periodKey: String) -> Bool {
        existingRecord(bucket: bucket, periodKey: periodKey).explicitEdit
    }

    func setExplicitEdit(bucket: PlanningBucket, periodKey: String, enabled: Bool) {
        var record = existingRecord(bucket: bucket, periodKey: periodKey)
        record.explicitEdit = enabled
        store(record)
    }

    func achievementFraction(for scope: ReflectionScope) -> Double {
        let items = reflectionItems(scope).filter { $0.kind == .task }
        let leaves = items.map { PlanningNode(title: $0.title, kind: .task, bucket: .monthly, completed: $0.completed) }
        return PeriodCalendar.completionFraction(of: leaves)
    }

    private func apply(_ decision: StoredReflectionDecision, scope: ReflectionScope, previous: ReflectionDisposition?) {
        writeDisposition(decision, scope: scope)
        if previous == .keep, decision.disposition != .keep {
            removeContinuation(decision, scope: scope)
        }
        if previous == .postpone, decision.disposition != .postpone {
            postponed.removeAll { matchesPostpone($0, decision) }
        }
        switch decision.disposition {
        case .keep:
            let siblings = decisions(for: scope)
            if !keptAncestor(of: decision, among: siblings, scope: scope) {
                ensureContinuation(decision, scope: scope)
            }
        case .postpone:
            ensurePostpone(decision, scope: scope)
        case .stop:
            break
        }
    }

    private func writeDisposition(_ decision: StoredReflectionDecision, scope: ReflectionScope) {
        if let nodeID = reflectionItems(scope).first(where: { $0.id == decision.itemID })?.nodeID {
            _ = updateNode(nodeID) { $0.reflectionDisposition = decision.disposition }
        }
    }

    private func keptAncestor(of decision: StoredReflectionDecision, among stored: [StoredReflectionDecision], scope: ReflectionScope) -> Bool {
        guard let nodeID = reflectionItems(scope).first(where: { $0.id == decision.itemID })?.nodeID else { return false }
        return ancestorIDs(of: nodeID).contains { ancestor in
            stored.contains { $0.itemID == ancestor && $0.disposition == .keep && $0.itemID != decision.itemID }
        }
    }

    private func ancestorIDs(of id: UUID) -> [UUID] {
        var chain: [UUID] = []
        func walk(_ nodes: [PlanningNode], parents: [UUID]) -> Bool {
            for node in nodes {
                if node.id == id {
                    chain = parents
                    return true
                }
                if walk(node.children, parents: parents + [node.id]) { return true }
            }
            return false
        }
        _ = walk(periodItems, parents: [])
        return chain
    }

    private func ensureContinuation(_ decision: StoredReflectionDecision, scope: ReflectionScope) {
        switch scope {
        case .period(let bucket, let key):
            let next = PeriodCalendar.shift(key, bucket: bucket, by: 1)
            guard !periodItems.contains(where: { $0.bucket == bucket && $0.periodKey == next && $0.logicalID == decision.logicalID }) else { return }
            guard let source = reflectionItems(scope).first(where: { $0.id == decision.itemID }),
                  let nodeID = source.nodeID,
                  let node = findNode(nodeID) else { return }
            periodItems.append(copied(node, bucket: bucket, periodKey: next))
        case .future(let year):
            guard decision.kind == .event, let eventID = decision.eventID,
                  let event = events.first(where: { $0.id == eventID }) else { return }
            guard !events.contains(where: { $0.sourceEventID == event.id && $0.year == year + 1 }) else { return }
            events.append(
                PlanningEventRecord(
                    title: event.title,
                    year: year + 1,
                    month: event.month,
                    startDay: event.startDay,
                    endDay: event.endDay,
                    timeMinutes: event.timeMinutes,
                    sourceEventID: event.id
                )
            )
        }
    }

    private func removeContinuation(_ decision: StoredReflectionDecision, scope: ReflectionScope) {
        switch scope {
        case .period(let bucket, let key):
            let next = PeriodCalendar.shift(key, bucket: bucket, by: 1)
            if let carried = periodItems.first(where: { $0.bucket == bucket && $0.periodKey == next && $0.logicalID == decision.logicalID }) {
                deleteNode(carried.id)
            }
        case .future(let year):
            events.removeAll { $0.sourceEventID == decision.eventID && $0.year == year + 1 }
        }
    }

    private func ensurePostpone(_ decision: StoredReflectionDecision, scope: ReflectionScope) {
        let bucket: PlanningBucket
        let originKey: String
        switch scope {
        case .period(let periodBucket, let key):
            bucket = periodBucket
            originKey = key
        case .future(let year):
            bucket = .monthly
            originKey = String(year)
        }
        if postponed.contains(where: { matchesPostpone($0, decision) }) { return }
        let source = periodItems.first { $0.logicalID == decision.logicalID }
        postponed.append(
            PostponedEntry(
                title: decision.title,
                kind: decision.kind,
                bucket: bucket,
                originBucket: bucket,
                originPeriodKey: originKey,
                iconSymbol: source?.iconSymbol ?? "circle",
                colorID: source?.colorID ?? PlanIconColor.defaultID,
                eventID: decision.eventID,
                todayTaskID: decision.todayTaskID,
                logicalID: decision.logicalID
            )
        )
    }

    private func matchesPostpone(_ entry: PostponedEntry, _ decision: StoredReflectionDecision) -> Bool {
        if let logicalID = entry.logicalID, logicalID == decision.logicalID { return true }
        if let eventID = decision.eventID, entry.eventID == eventID { return true }
        if let todayTaskID = decision.todayTaskID, entry.todayTaskID == todayTaskID { return true }
        return false
    }

    private func flattened(_ nodes: [PlanningNode]) -> [ReflectionItem] {
        nodes.flatMap { node in
            [item(from: node)] + flattened(node.children)
        }
    }

    private func item(from node: PlanningNode) -> ReflectionItem {
        ReflectionItem(
            id: node.id,
            logicalID: node.logicalID,
            title: node.title,
            kind: node.kind,
            completed: node.completed,
            eventID: node.eventID,
            todayTaskID: node.todayTaskID,
            nodeID: node.id
        )
    }

    private func futureHasActivity(_ year: Int) -> Bool {
        if events.contains(where: { $0.year == year }) { return true }
        if let model = years.first(where: { $0.year == year }), model.months.contains(where: { !$0.goal.isEmpty }) {
            return true
        }
        return false
    }

    private func futureRecord(_ year: Int) -> FutureReflectionRecord {
        futureReflections.first { $0.year == year }
            ?? FutureReflectionRecord(
                year: year,
                hasMeaningfulActivity: futureHasActivity(year),
                reflectionOutstanding: false,
                reflectionCompleted: false
            )
    }

    private func storeFuture(_ record: FutureReflectionRecord) {
        if let index = futureReflections.firstIndex(where: { $0.year == record.year }) {
            futureReflections[index] = record
        } else {
            futureReflections.append(record)
        }
    }

    private func date(_ day: Date, hour: Int) -> Date {
        let calendar = PeriodCalendar.calendar
        var parts = calendar.dateComponents([.year, .month, .day], from: day)
        parts.hour = hour
        return calendar.date(from: parts) ?? day
    }
}
