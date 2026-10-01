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

struct PlanningMemoryEntry: Identifiable, Hashable {
    var id = UUID()
    var scope: ReflectionScope
    var kind: PlanningMemoryKind
    var text: String
    var hasPhoto: Bool
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

    func decisions(for scope: ReflectionScope) -> [StoredReflectionDecision] {
        switch scope {
        case .period(let bucket, let key):
            existingRecord(bucket: bucket, periodKey: key).decisions
        case .future(let year):
            futureRecord(year).decisions
        }
    }

    func addMemory(scope: ReflectionScope, kind: PlanningMemoryKind, text: String, hasPhoto: Bool) {
        memoryEntries.append(PlanningMemoryEntry(scope: scope, kind: kind, text: text, hasPhoto: hasPhoto))
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
        switch scope {
        case .period(let periodBucket, _): bucket = periodBucket
        case .future: bucket = .monthly
        }
        if postponed.contains(where: { matchesPostpone($0, decision) }) { return }
        postponed.append(
            PostponedEntry(
                title: decision.title,
                kind: decision.kind,
                bucket: bucket,
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
