import Foundation

enum PlanningSection: String, CaseIterable, Identifiable, Hashable {
    case plan
    case future
    case monthly
    case weekly
    case daily
    case plus

    var id: String { rawValue }

    var indexTitle: String {
        switch self {
        case .plan: "Plan"
        case .future: "Future"
        case .monthly: "Monthly"
        case .weekly: "Weekly"
        case .daily: "Daily"
        case .plus: "+"
        }
    }

    var acceptsReflectionBadge: Bool {
        switch self {
        case .future, .monthly, .weekly, .daily: true
        case .plan, .plus: false
        }
    }
}

enum PlanningBucket: String, CaseIterable, Identifiable, Hashable {
    case monthly
    case weekly
    case daily

    var id: String { rawValue }

    var title: String {
        switch self {
        case .monthly: "Monthly"
        case .weekly: "Weekly"
        case .daily: "Daily"
        }
    }

    var section: PlanningSection {
        switch self {
        case .monthly: .monthly
        case .weekly: .weekly
        case .daily: .daily
        }
    }
}

enum PlanningItemKind: String, CaseIterable, Identifiable, Hashable {
    case task
    case event

    var id: String { rawValue }

    var title: String {
        switch self {
        case .task: "Tasks"
        case .event: "Events"
        }
    }
}

enum PlanTransferTarget: String, CaseIterable, Identifiable, Hashable {
    case monthlyTask
    case monthlyEvent
    case weeklyTask
    case weeklyEvent

    var id: String { rawValue }

    var title: String {
        switch self {
        case .monthlyTask: "Monthly ToDo"
        case .monthlyEvent: "Monthly 予定"
        case .weeklyTask: "Weekly ToDo"
        case .weeklyEvent: "Weekly 予定"
        }
    }

    var kind: PlanningItemKind {
        switch self {
        case .monthlyTask, .weeklyTask: .task
        case .monthlyEvent, .weeklyEvent: .event
        }
    }

    var bucket: PlanningBucket {
        switch self {
        case .monthlyTask, .monthlyEvent: .monthly
        case .weeklyTask, .weeklyEvent: .weekly
        }
    }
}

enum PlanningRoute: Hashable {
    case help
    case postponeBox
    case planEditor(UUID)
    case reflectionSettings
    case weeklySettings
}

struct PlanBullet: Identifiable, Hashable {
    var id: UUID
    var text: String
    var children: [PlanBullet]

    init(id: UUID = UUID(), text: String = "", children: [PlanBullet] = []) {
        self.id = id
        self.text = text
        self.children = children
    }
}

struct PlanDocument: Identifiable, Hashable {
    var id: UUID
    var title: String
    var bullets: [PlanBullet]
    var memo: String
    var replanCount: Int
    var createdAt: Date
    var updatedAt: Date
    var hasBeenSaved: Bool

    init(
        id: UUID = UUID(),
        title: String = "",
        bullets: [PlanBullet] = [PlanBullet()],
        memo: String = "",
        replanCount: Int = 0,
        createdAt: Date = Date(),
        updatedAt: Date = Date(),
        hasBeenSaved: Bool = false
    ) {
        self.id = id
        self.title = title
        self.bullets = bullets
        self.memo = memo
        self.replanCount = replanCount
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.hasBeenSaved = hasBeenSaved
    }
}

enum ReflectionDisposition: String, Codable, Hashable {
    case keep
    case postpone
    case stop
}

struct PlanningNode: Identifiable, Hashable {
    var id: UUID
    var title: String
    var children: [PlanningNode]
    var kind: PlanningItemKind
    var bucket: PlanningBucket
    var periodKey: String
    /// Same value when one logical item is shown on more than one period page.
    var logicalID: UUID
    var completed: Bool
    /// Separate from completion. 維持 / 先送り / 終了.
    var reflectionDisposition: ReflectionDisposition?
    /// Shared with Calendar when this node is an event. Not a second copy.
    var eventID: UUID?
    /// Shared with Today when this node is a Daily task.
    var todayTaskID: UUID?

    init(
        id: UUID = UUID(),
        title: String,
        children: [PlanningNode] = [],
        kind: PlanningItemKind,
        bucket: PlanningBucket,
        periodKey: String = "",
        logicalID: UUID = UUID(),
        completed: Bool = false,
        reflectionDisposition: ReflectionDisposition? = nil,
        eventID: UUID? = nil,
        todayTaskID: UUID? = nil
    ) {
        self.id = id
        self.title = title
        self.children = children
        self.kind = kind
        self.bucket = bucket
        self.periodKey = periodKey
        self.logicalID = logicalID
        self.completed = completed
        self.reflectionDisposition = reflectionDisposition
        self.eventID = eventID
        self.todayTaskID = todayTaskID
    }
}

struct PostponedEntry: Identifiable, Hashable {
    var id: UUID
    var title: String
    var kind: PlanningItemKind
    var bucket: PlanningBucket
    var eventID: UUID?
    var todayTaskID: UUID?

    init(
        id: UUID = UUID(),
        title: String,
        kind: PlanningItemKind,
        bucket: PlanningBucket,
        eventID: UUID? = nil,
        todayTaskID: UUID? = nil
    ) {
        self.id = id
        self.title = title
        self.kind = kind
        self.bucket = bucket
        self.eventID = eventID
        self.todayTaskID = todayTaskID
    }
}

struct PlanningEventRecord: Identifiable, Hashable {
    var id: UUID
    var title: String
    var year: Int
    var month: Int
    var startDay: Int
    var endDay: Int?
    var timeMinutes: Int?

    init(
        id: UUID = UUID(),
        title: String,
        year: Int,
        month: Int,
        startDay: Int,
        endDay: Int? = nil,
        timeMinutes: Int? = nil
    ) {
        self.id = id
        self.title = title
        self.year = year
        self.month = month
        self.startDay = startDay
        self.endDay = endDay
        self.timeMinutes = timeMinutes
    }
}

struct FutureMonthModel: Identifiable, Hashable {
    var month: Int
    /// Exactly one goal. This is the Monthly page goal for the same month.
    var goal: String
    var outlook: [String]

    var id: Int { month }
}

struct FutureYearModel: Identifiable, Hashable {
    var year: Int
    var months: [FutureMonthModel]

    var id: Int { year }
}

struct ReflectionObligation: Identifiable, Hashable {
    var id: UUID
    var section: PlanningSection
    var unresolved: Bool
    var hasMeaningfulActivity: Bool
    var count: Int
    /// Completed reflections stay available for the last-five history.
    var completedAt: Date?

    init(
        id: UUID = UUID(),
        section: PlanningSection,
        unresolved: Bool,
        hasMeaningfulActivity: Bool,
        count: Int,
        completedAt: Date? = nil
    ) {
        self.id = id
        self.section = section
        self.unresolved = unresolved
        self.hasMeaningfulActivity = hasMeaningfulActivity
        self.count = count
        self.completedAt = completedAt
    }
}

enum PlanningRules {
    static let maximumDepth = 3
    static let maximumBadgeCount = 99
    static let monthCount = 12
    static let reflectionHistoryLimit = 5

    static let transferExplanation = """
    プラン全体を移動する必要はありません。
    必要な1項目だけ、まとまりだけ、または全体を選んで
    Monthly / Weekly のToDo・予定へ反映できます。
    """

    static func visibleIndex(weeklyEnabled: Bool) -> [PlanningSection] {
        var items: [PlanningSection] = [.plan, .future, .monthly]
        if weeklyEnabled {
            items.append(.weekly)
        }
        items.append(contentsOf: [.daily, .plus])
        return items
    }

    static func displayedReflectionBadge(section: PlanningSection, obligations: [ReflectionObligation]) -> Int {
        guard section.acceptsReflectionBadge else { return 0 }
        let total = obligations.reduce(0) { partial, obligation in
            guard obligation.section == section, obligation.unresolved, obligation.hasMeaningfulActivity else {
                return partial
            }
            return partial + max(0, obligation.count)
        }
        return min(maximumBadgeCount, total)
    }

    static func canIndent(depth: Int) -> Bool {
        depth < maximumDepth - 1
    }

    static func makeYear(_ year: Int) -> FutureYearModel {
        FutureYearModel(
            year: year,
            months: (1...monthCount).map { FutureMonthModel(month: $0, goal: "", outlook: []) }
        )
    }
}

enum PlanBulletEditing {
    static func indent(_ id: UUID, in bullets: inout [PlanBullet], depth: Int = 0) -> Bool {
        for index in bullets.indices {
            if bullets[index].id == id {
                guard PlanningRules.canIndent(depth: depth), index > 0 else { return false }
                let bullet = bullets.remove(at: index)
                bullets[index - 1].children.append(bullet)
                return true
            }
            if indent(id, in: &bullets[index].children, depth: depth + 1) {
                return true
            }
        }
        return false
    }

    static func outdent(_ id: UUID, in bullets: inout [PlanBullet]) -> Bool {
        for index in bullets.indices {
            if let childIndex = bullets[index].children.firstIndex(where: { $0.id == id }) {
                let bullet = bullets[index].children.remove(at: childIndex)
                bullets.insert(bullet, at: index + 1)
                return true
            }
            if outdent(id, in: &bullets[index].children) {
                return true
            }
        }
        return false
    }

    static func depth(of id: UUID, in bullets: [PlanBullet], current: Int = 0) -> Int? {
        for bullet in bullets {
            if bullet.id == id { return current }
            if let found = depth(of: id, in: bullet.children, current: current + 1) {
                return found
            }
        }
        return nil
    }
}

@MainActor
final class PlanningSession: ObservableObject {
    @Published var section: PlanningSection = .plan
    @Published var weeklyEnabled = true
    @Published var plans: [PlanDocument] = []
    @Published var periodItems: [PlanningNode] = []
    @Published var postponed: [PostponedEntry] = []
    @Published var events: [PlanningEventRecord] = []
    @Published var years: [FutureYearModel] = []
    @Published var selectedYear: Int
    @Published var obligations: [ReflectionObligation] = []
    @Published var monthlyPeriodKey = ""
    @Published var weeklyPeriodKey = ""
    @Published var dailyPeriodKey = ""
    @Published var periodRecords: [PeriodReflectionRecord] = []

    init(year: Int = Calendar.current.component(.year, from: Date())) {
        selectedYear = year
        years = [PlanningRules.makeYear(year)]
    }

    var index: [PlanningSection] {
        PlanningRules.visibleIndex(weeklyEnabled: weeklyEnabled)
    }

    func badgeCount(for section: PlanningSection) -> Int {
        let base = PlanningRules.displayedReflectionBadge(section: section, obligations: obligations)
        let extra = periodRecords.reduce(0) { partial, record in
            guard record.bucket.section == section else { return partial }
            return partial + PeriodCalendar.periodBadge(
                hasMeaningfulActivity: record.hasMeaningfulActivity,
                outstanding: record.reflectionOutstanding,
                completed: record.reflectionCompleted
            )
        }
        return min(PlanningRules.maximumBadgeCount, base + extra)
    }

    func select(_ section: PlanningSection) {
        guard index.contains(section) else { return }
        self.section = section
    }

    func setWeeklyEnabled(_ enabled: Bool) {
        weeklyEnabled = enabled
        if !enabled, section == .weekly {
            section = .plan
        }
    }

    func yearModel() -> FutureYearModel {
        if let existing = years.first(where: { $0.year == selectedYear }) {
            return existing
        }
        return PlanningRules.makeYear(selectedYear)
    }

    func ensureSelectedYear() {
        if !years.contains(where: { $0.year == selectedYear }) {
            years.append(PlanningRules.makeYear(selectedYear))
        }
    }

    func updateYear(_ year: FutureYearModel) {
        if let index = years.firstIndex(where: { $0.year == year.year }) {
            years[index] = year
        } else {
            years.append(year)
        }
    }

    func shiftYear(by delta: Int) {
        selectedYear += delta
        if !years.contains(where: { $0.year == selectedYear }) {
            years.append(PlanningRules.makeYear(selectedYear))
        }
    }

    func beginPlan() -> UUID {
        let plan = PlanDocument()
        plans.insert(plan, at: 0)
        return plan.id
    }

    func save(planID: UUID, title: String, bullets: [PlanBullet], memo: String) {
        guard let index = plans.firstIndex(where: { $0.id == planID }) else { return }
        if plans[index].hasBeenSaved {
            plans[index].replanCount += 1
        }
        plans[index].title = title
        plans[index].bullets = bullets
        plans[index].memo = memo
        plans[index].updatedAt = Date()
        plans[index].hasBeenSaved = true
    }

    func transfer(planID: UUID, bulletIDs: Set<UUID>, includeChildren: Bool, to target: PlanTransferTarget) {
        guard let plan = plans.first(where: { $0.id == planID }) else { return }
        let selected = selectedBullets(in: plan.bullets, ids: bulletIDs, includeChildren: includeChildren, force: false)
        let key = periodKey(for: target.bucket)
        periodItems.append(contentsOf: selected.map { node(from: $0, target: target, periodKey: key) })
        markActivity(bucket: target.bucket, periodKey: key)
    }

    func movePostponed(_ id: UUID, to bucket: PlanningBucket) {
        guard let index = postponed.firstIndex(where: { $0.id == id }) else { return }
        postponed[index].bucket = bucket
    }

    func placePostponedOnPlan(_ id: UUID) {
        guard let entry = postponed.first(where: { $0.id == id }) else { return }
        let key = periodKey(for: entry.bucket)
        guard !containsLogicalItem(eventID: entry.eventID, todayTaskID: entry.todayTaskID, bucket: entry.bucket, periodKey: key) else {
            postponed.removeAll { $0.id == id }
            return
        }
        periodItems.append(
            PlanningNode(
                title: entry.title,
                kind: entry.kind,
                bucket: entry.bucket,
                periodKey: key,
                logicalID: entry.todayTaskID ?? entry.eventID ?? UUID(),
                eventID: entry.eventID,
                todayTaskID: entry.todayTaskID
            )
        )
        postponed.removeAll { $0.id == id }
        markActivity(bucket: entry.bucket, periodKey: key)
    }

    func addEvent(_ event: PlanningEventRecord) {
        if let index = events.firstIndex(where: { $0.id == event.id }) {
            events[index] = event
        } else {
            events.append(event)
        }
    }

    func restore(from navigation: TabNavigationState) {
        if let raw = navigation.selectedValues["planning.section"], let restored = PlanningSection(rawValue: raw) {
            section = restored
        }
        if let raw = navigation.selectedValues["planning.futureYear"], let year = Int(raw) {
            selectedYear = year
        }
        if navigation.selectedValues["planning.weeklyEnabled"] == "false" {
            weeklyEnabled = false
        }
        monthlyPeriodKey = navigation.selectedValues["planning.monthlyPeriod"] ?? ""
        weeklyPeriodKey = navigation.selectedValues["planning.weeklyPeriod"] ?? ""
        dailyPeriodKey = navigation.selectedValues["planning.dailyPeriod"] ?? ""
        if !index.contains(section) {
            section = .plan
        }
        if !years.contains(where: { $0.year == selectedYear }) {
            years.append(PlanningRules.makeYear(selectedYear))
        }
        ensurePeriodDefaults()
    }

    func persist(into navigation: TabNavigationState) {
        navigation.selectedValues["planning.section"] = section.rawValue
        navigation.selectedValues["planning.futureYear"] = String(selectedYear)
        navigation.selectedValues["planning.weeklyEnabled"] = weeklyEnabled ? "true" : "false"
        navigation.selectedValues["planning.monthlyPeriod"] = monthlyPeriodKey
        navigation.selectedValues["planning.weeklyPeriod"] = weeklyPeriodKey
        navigation.selectedValues["planning.dailyPeriod"] = dailyPeriodKey
    }

    private func selectedBullets(in bullets: [PlanBullet], ids: Set<UUID>, includeChildren: Bool, force: Bool) -> [PlanBullet] {
        bullets.flatMap { bullet -> [PlanBullet] in
            let chosen = force || ids.contains(bullet.id)
            if chosen {
                if includeChildren || force {
                    return [bullet]
                }
                return [PlanBullet(id: bullet.id, text: bullet.text, children: [])]
            }
            return selectedBullets(in: bullet.children, ids: ids, includeChildren: includeChildren, force: false)
        }
    }

    private func node(from bullet: PlanBullet, target: PlanTransferTarget, periodKey: String) -> PlanningNode {
        let eventID = target.kind == .event ? UUID() : nil
        let logicalID = UUID()
        return PlanningNode(
            title: bullet.text,
            children: bullet.children.map { node(from: $0, target: target, periodKey: periodKey) },
            kind: target.kind,
            bucket: target.bucket,
            periodKey: periodKey,
            logicalID: logicalID,
            eventID: eventID,
            todayTaskID: target.bucket == .daily && target.kind == .task ? logicalID : nil
        )
    }
}
