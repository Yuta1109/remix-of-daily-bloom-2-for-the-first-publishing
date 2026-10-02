import Foundation

enum PeriodAddSource: String, CaseIterable, Identifiable {
    case plan
    case create
    case postpone
    case monthly
    case periods

    var id: String { rawValue }

    var title: String {
        switch self {
        case .plan: "Planから追加"
        case .create: "新しく追加"
        case .postpone: "先送りボックスから追加"
        case .monthly: "Monthlyから追加"
        case .periods: "Monthly / Weeklyから追加"
        }
    }
}

struct PeriodReflectionRecord: Identifiable, Hashable {
    var bucket: PlanningBucket
    var periodKey: String
    var hasMeaningfulActivity: Bool
    var reflectionOutstanding: Bool
    var reflectionCompleted: Bool
    var skipped = false
    var completedAt: Date?
    var decisions: [StoredReflectionDecision] = []
    var explicitEdit = false

    var id: String { "\(bucket.rawValue):\(periodKey)" }
}

enum PeriodCalendar {
    static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.locale = Locale(identifier: "ja_JP")
        calendar.firstWeekday = 2
        return calendar
    }

    static func currentKey(_ bucket: PlanningBucket, now: Date = Date()) -> String {
        switch bucket {
        case .monthly:
            let parts = calendar.dateComponents([.year, .month], from: now)
            return monthKey(year: parts.year ?? 2026, month: parts.month ?? 1)
        case .weekly:
            return weekKey(containing: now)
        case .daily:
            return dayKey(now)
        }
    }

    static func monthKey(year: Int, month: Int) -> String {
        String(format: "%04d-%02d", year, month)
    }

    static func dayKey(_ date: Date) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 2026, parts.month ?? 1, parts.day ?? 1)
    }

    static func weekKey(containing date: Date) -> String {
        let start = calendar.dateInterval(of: .weekOfYear, for: date)?.start ?? date
        return dayKey(start)
    }

    static func shift(_ key: String, bucket: PlanningBucket, by delta: Int) -> String {
        switch bucket {
        case .monthly:
            let parts = monthParts(key)
            let date = calendar.date(from: DateComponents(year: parts.year, month: parts.month, day: 1)) ?? Date()
            let moved = calendar.date(byAdding: .month, value: delta, to: date) ?? date
            return currentKey(.monthly, now: moved)
        case .weekly:
            let date = date(from: key) ?? Date()
            let moved = calendar.date(byAdding: .day, value: delta * 7, to: date) ?? date
            return weekKey(containing: moved)
        case .daily:
            let date = date(from: key) ?? Date()
            let moved = calendar.date(byAdding: .day, value: delta, to: date) ?? date
            return dayKey(moved)
        }
    }

    static func label(bucket: PlanningBucket, key: String) -> String {
        switch bucket {
        case .monthly:
            let parts = monthParts(key)
            return "\(parts.year)年\(parts.month)月"
        case .weekly:
            let start = date(from: key) ?? Date()
            let end = calendar.date(byAdding: .day, value: 6, to: start) ?? start
            return "\(dayLabel(start)) – \(shortDayLabel(end))"
        case .daily:
            let date = date(from: key) ?? Date()
            let weekday = calendar.shortWeekdaySymbols[calendar.component(.weekday, from: date) - 1]
            return "\(dayLabel(date)) (\(weekday))"
        }
    }

    static func addSources(for bucket: PlanningBucket) -> [PeriodAddSource] {
        switch bucket {
        case .monthly: [.plan, .create, .postpone]
        case .weekly: [.plan, .create, .postpone, .monthly]
        case .daily: [.periods, .create, .postpone]
        }
    }

    static func allowsCompletionToggle(_ bucket: PlanningBucket) -> Bool {
        bucket != .daily
    }

    static func periodBadge(hasMeaningfulActivity: Bool, outstanding: Bool, completed: Bool, skipped: Bool = false) -> Int {
        guard outstanding, hasMeaningfulActivity, !completed, !skipped else { return 0 }
        return 1
    }

    static func completionFraction(of nodes: [PlanningNode]) -> Double {
        let leaves = flattenedLeaves(nodes)
        guard !leaves.isEmpty else { return 0 }
        let done = leaves.filter(\.completed).count
        return Double(done) / Double(leaves.count)
    }

    static func flattenedLeaves(_ nodes: [PlanningNode]) -> [PlanningNode] {
        nodes.flatMap { node in
            node.children.isEmpty ? [node] : flattenedLeaves(node.children)
        }
    }

    static func monthParts(_ key: String) -> (year: Int, month: Int) {
        let pieces = key.split(separator: "-")
        let year = Int(pieces.first ?? "") ?? 2026
        let month = pieces.count > 1 ? Int(pieces[1]) ?? 1 : 1
        return (year, min(12, max(1, month)))
    }

    static func date(from key: String) -> Date? {
        let pieces = key.split(separator: "-")
        guard pieces.count >= 3,
              let year = Int(pieces[0]),
              let month = Int(pieces[1]),
              let day = Int(pieces[2]) else { return nil }
        return calendar.date(from: DateComponents(year: year, month: month, day: day))
    }

    private static func dayLabel(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = Locale(identifier: "ja_JP")
        formatter.dateFormat = "yyyy年M月d日"
        return formatter.string(from: date)
    }

    private static func shortDayLabel(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = Locale(identifier: "ja_JP")
        formatter.dateFormat = "M月d日"
        return formatter.string(from: date)
    }
}

extension PlanningSession {
    func ensurePeriodDefaults() {
        if monthlyPeriodKey.isEmpty { monthlyPeriodKey = PeriodCalendar.currentKey(.monthly) }
        if weeklyPeriodKey.isEmpty { weeklyPeriodKey = PeriodCalendar.currentKey(.weekly) }
        if dailyPeriodKey.isEmpty { dailyPeriodKey = PeriodCalendar.currentKey(.daily) }
    }

    func periodKey(for bucket: PlanningBucket) -> String {
        switch bucket {
        case .monthly: monthlyPeriodKey.isEmpty ? PeriodCalendar.currentKey(.monthly) : monthlyPeriodKey
        case .weekly: weeklyPeriodKey.isEmpty ? PeriodCalendar.currentKey(.weekly) : weeklyPeriodKey
        case .daily: dailyPeriodKey.isEmpty ? PeriodCalendar.currentKey(.daily) : dailyPeriodKey
        }
    }

    func shiftPeriod(_ bucket: PlanningBucket, by delta: Int) {
        let next = PeriodCalendar.shift(periodKey(for: bucket), bucket: bucket, by: delta)
        assignPeriod(next, bucket: bucket)
    }

    func assignPeriod(_ key: String, bucket: PlanningBucket) {
        switch bucket {
        case .monthly: monthlyPeriodKey = key
        case .weekly: weeklyPeriodKey = key
        case .daily: dailyPeriodKey = key
        }
    }

    func isReflectionComplete(bucket: PlanningBucket, periodKey: String) -> Bool {
        periodRecords.first { $0.bucket == bucket && $0.periodKey == periodKey }?.reflectionCompleted == true
    }

    func markActivity(bucket: PlanningBucket, periodKey: String) {
        var record = existingRecord(bucket: bucket, periodKey: periodKey)
        record.hasMeaningfulActivity = true
        store(record)
    }

    func setReflectionOutstanding(bucket: PlanningBucket, periodKey: String, outstanding: Bool) {
        var record = existingRecord(bucket: bucket, periodKey: periodKey)
        record.reflectionOutstanding = outstanding
        store(record)
    }

    func completeReflection(bucket: PlanningBucket, periodKey: String) {
        var record = existingRecord(bucket: bucket, periodKey: periodKey)
        record.reflectionCompleted = true
        record.reflectionOutstanding = false
        store(record)
    }

    func nodes(bucket: PlanningBucket, periodKey: String, kind: PlanningItemKind) -> [PlanningNode] {
        periodItems.filter { $0.bucket == bucket && $0.periodKey == periodKey && $0.kind == kind }
    }

    @discardableResult
    func setCompleted(nodeID: UUID, completed: Bool) -> Bool {
        guard let bucket = findNode(nodeID)?.bucket, PeriodCalendar.allowsCompletionToggle(bucket) else { return false }
        return updateNode(nodeID) { $0.completed = completed }
    }

    func applyExternalDailyCompletion(todayTaskID: UUID, completed: Bool) {
        periodItems = periodItems.map { applyDailyCompletion($0, todayTaskID: todayTaskID, completed: completed) }
    }

    func addCreatedItem(title: String, bucket: PlanningBucket, kind: PlanningItemKind, periodKey: String) {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let logicalID = UUID()
        var eventID: UUID?
        if kind == .event {
            eventID = UUID()
            events.append(eventRecord(id: eventID!, title: trimmed, bucket: bucket, periodKey: periodKey))
        }
        periodItems.append(
            PlanningNode(
                title: trimmed,
                kind: kind,
                bucket: bucket,
                periodKey: periodKey,
                logicalID: logicalID,
                eventID: eventID,
                todayTaskID: bucket == .daily && kind == .task ? logicalID : nil
            )
        )
        markActivity(bucket: bucket, periodKey: periodKey)
    }

    func addChild(to parentID: UUID, title: String) {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let parent = findNode(parentID) else { return }
        let depth = nodeDepth(parentID) ?? 0
        guard PlanningRules.canIndent(depth: depth) else { return }
        let child = PlanningNode(
            title: trimmed,
            kind: .task,
            bucket: parent.bucket,
            periodKey: parent.periodKey,
            logicalID: UUID(),
            todayTaskID: parent.bucket == .daily ? UUID() : nil
        )
        _ = updateNode(parentID) { $0.children.append(child) }
        markActivity(bucket: parent.bucket, periodKey: parent.periodKey)
    }

    func deleteNode(_ id: UUID) {
        if let node = findNode(id) {
            markActivity(bucket: node.bucket, periodKey: node.periodKey)
        }
        periodItems = deleting(id, from: periodItems)
    }

    func renameNode(_ id: UUID, title: String) {
        _ = updateNode(id) { $0.title = title }
        if let node = findNode(id) {
            markActivity(bucket: node.bucket, periodKey: node.periodKey)
        }
    }

    func placeCopy(_ id: UUID, into bucket: PlanningBucket, periodKey: String) {
        guard let node = findNode(id) else { return }
        guard !periodItems.contains(where: { $0.bucket == bucket && $0.periodKey == periodKey && $0.logicalID == node.logicalID }) else { return }
        var copy = copied(node, bucket: bucket, periodKey: periodKey)
        if bucket == .daily, copy.kind == .task {
            copy.todayTaskID = node.logicalID
        }
        periodItems.append(copy)
        markActivity(bucket: bucket, periodKey: periodKey)
    }

    func copyMonthlyTasks(_ ids: Set<UUID>, toWeeklyPeriod periodKey: String) {
        let chosen = periodItems.filter { ids.contains($0.id) && $0.bucket == .monthly && $0.kind == .task }
        for node in chosen where !periodItems.contains(where: { $0.bucket == .weekly && $0.periodKey == periodKey && $0.logicalID == node.logicalID }) {
            periodItems.append(copied(node, bucket: .weekly, periodKey: periodKey))
        }
        markActivity(bucket: .weekly, periodKey: periodKey)
    }

    func eventsRelevantToWeek(_ weekKey: String) -> [PlanningEventRecord] {
        guard let start = PeriodCalendar.date(from: weekKey) else { return [] }
        let end = PeriodCalendar.calendar.date(byAdding: .day, value: 6, to: start) ?? start
        return events.filter { record in
            guard let day = record.startDay,
                  let date = PeriodCalendar.calendar.date(from: DateComponents(year: record.year, month: record.month, day: day)) else {
                return false
            }
            return date >= start && date <= end
        }
    }

    func linkWeeklyEvent(_ eventID: UUID, weekKey: String) {
        guard let event = events.first(where: { $0.id == eventID }) else { return }
        guard !periodItems.contains(where: { $0.bucket == .weekly && $0.periodKey == weekKey && $0.eventID == eventID }) else { return }
        periodItems.append(
            PlanningNode(
                title: event.title,
                kind: .event,
                bucket: .weekly,
                periodKey: weekKey,
                logicalID: eventID,
                eventID: eventID
            )
        )
        markActivity(bucket: .weekly, periodKey: weekKey)
    }

    func retrievePostponed(_ id: UUID, into bucket: PlanningBucket, periodKey: String) -> Bool {
        guard let entry = postponed.first(where: { $0.id == id }) else { return false }
        if containsLogicalItem(eventID: entry.eventID, todayTaskID: entry.todayTaskID, bucket: bucket, periodKey: periodKey) {
            return false
        }
        periodItems.append(
            PlanningNode(
                title: entry.title,
                kind: entry.kind,
                bucket: bucket,
                periodKey: periodKey,
                logicalID: entry.todayTaskID ?? entry.eventID ?? UUID(),
                eventID: entry.eventID,
                todayTaskID: entry.todayTaskID
            )
        )
        postponed.removeAll { $0.id == id }
        markActivity(bucket: bucket, periodKey: periodKey)
        return true
    }

    func keepCandidates(for bucket: PlanningBucket, before periodKey: String) -> [PlanningNode] {
        periodItems.filter {
            $0.bucket == bucket && $0.periodKey < periodKey && $0.reflectionDisposition == .keep
        }
    }

    func goal(year: Int, month: Int) -> String {
        years.first { $0.year == year }?.months.first { $0.month == month }?.goal ?? ""
    }

    func setGoal(_ goal: String, year: Int, month: Int) {
        var model = years.first { $0.year == year } ?? PlanningRules.makeYear(year)
        guard let index = model.months.firstIndex(where: { $0.month == month }) else { return }
        model.months[index].goal = goal
        updateYear(model)
    }

    func containsLogicalItem(eventID: UUID?, todayTaskID: UUID?, bucket: PlanningBucket, periodKey: String) -> Bool {
        periodItems.contains { node in
            node.bucket == bucket && node.periodKey == periodKey && (
                (eventID != nil && node.eventID == eventID) ||
                (todayTaskID != nil && node.todayTaskID == todayTaskID)
            )
        }
    }

    func existingRecord(bucket: PlanningBucket, periodKey: String) -> PeriodReflectionRecord {
        periodRecords.first { $0.bucket == bucket && $0.periodKey == periodKey }
            ?? PeriodReflectionRecord(
                bucket: bucket,
                periodKey: periodKey,
                hasMeaningfulActivity: false,
                reflectionOutstanding: false,
                reflectionCompleted: false
            )
    }

    func store(_ record: PeriodReflectionRecord) {
        if let index = periodRecords.firstIndex(where: { $0.id == record.id }) {
            periodRecords[index] = record
        } else {
            periodRecords.append(record)
        }
    }

    private func eventRecord(id: UUID, title: String, bucket: PlanningBucket, periodKey: String) -> PlanningEventRecord {
        let date = PeriodCalendar.date(from: bucket == .monthly ? "\(periodKey)-01" : periodKey) ?? Date()
        let parts = PeriodCalendar.calendar.dateComponents([.year, .month, .day], from: date)
        return PlanningEventRecord(
            id: id,
            title: title,
            year: parts.year ?? selectedYear,
            month: parts.month ?? 1,
            startDay: parts.day ?? 1
        )
    }

    func saveItem(existingID: UUID?, draft: PlanningItemDraft, bucket: PlanningBucket, kind: PlanningItemKind, periodKey: String) {
        let children = draft.subtasks.compactMap { subtask -> PlanningNode? in
            let title = subtask.title.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !title.isEmpty else { return nil }
            return PlanningNode(
                id: subtask.id,
                title: title,
                kind: kind,
                bucket: bucket,
                periodKey: periodKey,
                logicalID: subtask.id,
                todayTaskID: bucket == .daily && kind == .task ? subtask.id : nil,
                colorID: draft.colorID,
                startMinutes: subtask.startMinutes,
                endMinutes: subtask.endMinutes
            )
        }
        if let existingID, findNode(existingID) != nil {
            _ = updateNode(existingID) { node in
                node.title = draft.title
                node.iconSymbol = draft.iconSymbol
                node.colorID = draft.colorID
                node.startDay = draft.startDay
                node.endDay = draft.endDay
                node.startMinutes = draft.startMinutes
                node.endMinutes = draft.endMinutes
                node.children = children
                syncEvent(node)
            }
            return
        }
        let logicalID = UUID()
        var eventID: UUID?
        if kind == .event {
            eventID = UUID()
            var record = eventRecord(id: eventID!, title: draft.title, bucket: bucket, periodKey: periodKey)
            record.startDay = draft.startDay ?? record.startDay
            record.endDay = draft.endDay
            record.timeMinutes = draft.startMinutes
            record.endTimeMinutes = draft.endMinutes
            record.iconSymbol = draft.iconSymbol
            record.colorID = draft.colorID
            events.append(record)
        }
        periodItems.append(
            PlanningNode(
                title: draft.title,
                children: children,
                kind: kind,
                bucket: bucket,
                periodKey: periodKey,
                logicalID: logicalID,
                eventID: eventID,
                todayTaskID: bucket == .daily && kind == .task ? logicalID : nil,
                iconSymbol: draft.iconSymbol,
                colorID: draft.colorID,
                startDay: draft.startDay,
                endDay: draft.endDay,
                startMinutes: draft.startMinutes,
                endMinutes: draft.endMinutes
            )
        )
        markActivity(bucket: bucket, periodKey: periodKey)
    }

    func importSources(_ ids: Set<UUID>, source: PeriodAddSource, bucket: PlanningBucket, kind: PlanningItemKind, periodKey: String) {
        switch source {
        case .create:
            break
        case .plan:
            for plan in plans where plan.hasBeenSaved {
                let target = PlanTransferTarget.allCases.first { $0.bucket == bucket && $0.kind == kind }
                if let target {
                    transfer(planID: plan.id, bulletIDs: ids, includeChildren: false, to: target)
                }
            }
        case .postpone:
            for id in ids {
                _ = retrievePostponed(id, into: bucket, periodKey: periodKey)
            }
        case .monthly:
            if kind == .task {
                copyMonthlyTasks(ids, toWeeklyPeriod: periodKey)
            } else {
                for id in ids {
                    if let eventID = findNode(id)?.eventID {
                        linkWeeklyEvent(eventID, weekKey: periodKey)
                    }
                }
            }
        case .periods:
            for id in ids {
                placeCopy(id, into: bucket, periodKey: periodKey)
            }
        }
    }

    private func syncEvent(_ node: PlanningNode) {
        guard node.kind == .event, let eventID = node.eventID else { return }
        guard let index = events.firstIndex(where: { $0.id == eventID }) else { return }
        events[index].title = node.title
        events[index].startDay = node.startDay ?? events[index].startDay
        events[index].endDay = node.endDay
        events[index].timeMinutes = node.startMinutes
        events[index].endTimeMinutes = node.endMinutes
        events[index].iconSymbol = node.iconSymbol
        events[index].colorID = node.colorID
    }

    func copied(_ node: PlanningNode, bucket: PlanningBucket, periodKey: String) -> PlanningNode {
        PlanningNode(
            title: node.title,
            children: node.children.map { child in
                var copy = copied(child, bucket: bucket, periodKey: periodKey)
                copy.children = []
                return copy
            },
            kind: node.kind,
            bucket: bucket,
            periodKey: periodKey,
            logicalID: node.logicalID,
            completed: node.completed,
            reflectionDisposition: nil,
            eventID: node.eventID,
            todayTaskID: bucket == .daily && node.kind == .task ? node.logicalID : node.todayTaskID,
            iconSymbol: node.iconSymbol,
            colorID: node.colorID,
            startDay: node.startDay,
            endDay: node.endDay,
            startMinutes: node.startMinutes,
            endMinutes: node.endMinutes
        )
    }

    private func applyDailyCompletion(_ node: PlanningNode, todayTaskID: UUID, completed: Bool) -> PlanningNode {
        var copy = node
        if copy.bucket == .daily, copy.todayTaskID == todayTaskID {
            copy.completed = completed
        }
        copy.children = copy.children.map { applyDailyCompletion($0, todayTaskID: todayTaskID, completed: completed) }
        return copy
    }

    func findNode(_ id: UUID, in nodes: [PlanningNode]? = nil) -> PlanningNode? {
        for node in nodes ?? periodItems {
            if node.id == id { return node }
            if let found = findNode(id, in: node.children) { return found }
        }
        return nil
    }

    private func nodeDepth(_ id: UUID, in nodes: [PlanningNode]? = nil, depth: Int = 0) -> Int? {
        for node in nodes ?? periodItems {
            if node.id == id { return depth }
            if let found = nodeDepth(id, in: node.children, depth: depth + 1) { return found }
        }
        return nil
    }

    @discardableResult
    func updateNode(_ id: UUID, change: (inout PlanningNode) -> Void) -> Bool {
        let result = replacing(id, in: periodItems, change: change)
        periodItems = result.nodes
        return result.found
    }

    private func replacing(_ id: UUID, in nodes: [PlanningNode], change: (inout PlanningNode) -> Void) -> (nodes: [PlanningNode], found: Bool) {
        var found = false
        let updated = nodes.map { node -> PlanningNode in
            var copy = node
            if copy.id == id {
                change(&copy)
                found = true
                return copy
            }
            let children = replacing(id, in: copy.children, change: change)
            if children.found {
                copy.children = children.nodes
                found = true
            }
            return copy
        }
        return (updated, found)
    }

    private func deleting(_ id: UUID, from nodes: [PlanningNode]) -> [PlanningNode] {
        nodes.compactMap { node in
            if node.id == id { return nil }
            var copy = node
            copy.children = deleting(id, from: copy.children)
            return copy
        }
    }
}
