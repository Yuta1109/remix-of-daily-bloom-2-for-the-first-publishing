import Foundation
import UIKit

/// TEMPORARY TestFlight seed. In memory only. Delete this type and the
/// `PlanningSession` init call when sample data is no longer needed.
enum TemporaryPlanningSamples {
    static let enabled = true

    @MainActor
    static func install(_ session: PlanningSession) {
        let now = Date()
        let monthly = PeriodCalendar.currentKey(.monthly, now: now)
        let weekly = PeriodCalendar.currentKey(.weekly, now: now)
        let daily = PeriodCalendar.currentKey(.daily, now: now)
        session.monthlyPeriodKey = monthly
        session.weeklyPeriodKey = weekly
        session.dailyPeriodKey = daily

        session.postponed.append(contentsOf: [
            PostponedEntry(title: "資料の見直し", kind: .task, bucket: .monthly, originBucket: .monthly, originPeriodKey: "2026-09", iconSymbol: "doc.text", colorID: "peach", isSample: true),
            PostponedEntry(title: "月次の打ち合わせ", kind: .event, bucket: .monthly, originBucket: .monthly, originPeriodKey: "2026-09", iconSymbol: "person.3", colorID: "rose", isSample: true),
            PostponedEntry(title: "週報の下書き", kind: .task, bucket: .weekly, originBucket: .weekly, originPeriodKey: "2026-09-14", iconSymbol: "chart.bar", colorID: "yellow", isSample: true),
            PostponedEntry(title: "チーム昼食", kind: .event, bucket: .weekly, originBucket: .weekly, originPeriodKey: "2026-09-14", iconSymbol: "fork.knife", colorID: "yellow", isSample: true),
            PostponedEntry(title: "メールの返信", kind: .task, bucket: .daily, originBucket: .daily, originPeriodKey: "2026-10-05", iconSymbol: "envelope", colorID: "mint", isSample: true),
            PostponedEntry(title: "夕方の散歩", kind: .event, bucket: .daily, originBucket: .daily, originPeriodKey: "2026-10-05", iconSymbol: "figure.walk", colorID: "sky", isSample: true),
            PostponedEntry(title: "友人と食事に行く", kind: .task, bucket: .daily, originBucket: .monthly, originPeriodKey: "2026-09", iconSymbol: "person.2", colorID: "sky", isSample: true)
        ])

        session.periodItems.append(contentsOf: blueprintItems(monthly: monthly, weekly: weekly, daily: daily))
        session.repairSampleScheduleDates()

        for bucket in [PlanningBucket.monthly, .weekly, .daily] {
            let current = PeriodCalendar.currentKey(bucket, now: now)
            if bucket == .daily {
                seedDailyTutorialReflection(session, key: PeriodCalendar.shift(current, bucket: bucket, by: -1))
                session.registerDailyTutorialPeriods(
                    photoKey: PeriodCalendar.shift(current, bucket: bucket, by: -2),
                    diaryKey: PeriodCalendar.shift(current, bucket: bucket, by: -3)
                )
            } else {
                seedDemoReflection(session, bucket: bucket, key: PeriodCalendar.shift(current, bucket: bucket, by: -1))
            }
            seedDemoPhoto(session, bucket: bucket, key: PeriodCalendar.shift(current, bucket: bucket, by: -2))
            seedDemoDiary(session, bucket: bucket, key: PeriodCalendar.shift(current, bucket: bucket, by: -3))
        }
        seedSamplePeriod(session, bucket: .monthly, key: monthly)
        seedSamplePeriod(session, bucket: .weekly, key: weekly)
        seedSamplePeriod(session, bucket: .daily, key: daily)
    }

    /// Adds a sample period record only when that period has no record yet.
    @MainActor
    private static func seedSamplePeriod(_ session: PlanningSession, bucket: PlanningBucket, key: String) {
        if session.periodRecords.contains(where: { $0.bucket == bucket && $0.periodKey == key }) { return }
        session.store(
            PeriodReflectionRecord(
                bucket: bucket,
                periodKey: key,
                hasMeaningfulActivity: true,
                reflectionOutstanding: false,
                reflectionCompleted: false,
                isSample: true
            )
        )
    }

    private static func blueprintItems(monthly: String, weekly: String, daily: String) -> [PlanningNode] {
        let readParent = monthlyParts(monthly, day: 15)
        let readFirst = monthlyParts(monthly, day: 12)
        let meal = monthlyParts(monthly, day: 20)
        let meeting = monthlyParts(monthly, day: 8)
        let checkup = monthlyParts(monthly, day: 16)
        let focus = weekParts(weekly, offset: 2)
        let weeklyRead = weekParts(weekly, offset: 1)
        let weeklyReadNext = weekParts(weekly, offset: 3)
        let weeklyMeal = weekParts(weekly, offset: 5)
        let weeklyMeeting = weekParts(weekly, offset: 1)
        let weeklyCheck = weekParts(weekly, offset: 4)
        let today = PeriodCalendar.dateParts(periodKey: daily, dayOffset: 0)
        return [
            item("健康的な生活", .task, .monthly, monthly, symbol: "leaf", color: "mint", children: [
                item("朝のストレッチ", .task, .monthly, monthly)
            ]),
            item("本を2冊読む", .task, .monthly, monthly, completed: true, symbol: "book", color: "sky", month: readParent.month, day: readParent.day, children: [
                item("1冊目を読む", .task, .monthly, monthly, month: readFirst.month, day: readFirst.day),
                item("2冊目を読む", .task, .monthly, monthly, completed: true, month: readParent.month, day: readParent.day)
            ]),
            item("友人と食事に行く", .task, .monthly, monthly, symbol: "fork.knife", color: "yellow", month: meal.month, day: meal.day, minutes: 19 * 60),
            item("定例ミーティング", .event, .monthly, monthly, symbol: "person.3", color: "rose", month: meeting.month, day: meeting.day, minutes: 9 * 60),
            item("歯科検診", .event, .monthly, monthly, completed: true, symbol: "stethoscope", color: "mint", month: checkup.month, day: checkup.day, minutes: 14 * 60),
            item("今週の集中作業", .task, .weekly, weekly, symbol: "leaf", color: "mint", month: focus.month, day: focus.day, minutes: 10 * 60),
            item("本を2冊読む", .task, .weekly, weekly, completed: true, symbol: "book", color: "sky", month: weeklyRead.month, day: weeklyRead.day, children: [
                item("1冊目を読む", .task, .weekly, weekly, month: weeklyRead.month, day: weeklyRead.day),
                item("2冊目を読む", .task, .weekly, weekly, completed: true, month: weeklyReadNext.month, day: weeklyReadNext.day)
            ]),
            item("友人と食事に行く", .task, .weekly, weekly, symbol: "fork.knife", color: "yellow", month: weeklyMeal.month, day: weeklyMeal.day, minutes: 19 * 60),
            item("週の打ち合わせ", .event, .weekly, weekly, symbol: "person.3", color: "rose", month: weeklyMeeting.month, day: weeklyMeeting.day, minutes: 9 * 60),
            item("歯科検診", .event, .weekly, weekly, completed: true, symbol: "stethoscope", color: "mint", month: weeklyCheck.month, day: weeklyCheck.day, minutes: 14 * 60),
            item("健康診断を予約する", .task, .daily, daily, completed: true, symbol: "stethoscope", color: "rose", month: today?.month, day: today?.day, minutes: 10 * 60, children: [
                item("持ち物を確認", .task, .daily, daily)
            ]),
            item("会議資料を作る", .task, .daily, daily, symbol: "briefcase", color: "mint"),
            item("定例ミーティング", .event, .daily, daily, symbol: "person.3", color: "rose", month: today?.month, day: today?.day, minutes: 9 * 60),
            item("歯科検診", .event, .daily, daily, completed: true, symbol: "stethoscope", color: "mint", month: today?.month, day: today?.day, minutes: 14 * 60)
        ]
    }

    private static func monthlyParts(_ key: String, day: Int) -> (month: Int, day: Int) {
        let parts = PeriodCalendar.monthParts(key)
        return (parts.month, PeriodCalendar.clampedDay(year: parts.year, month: parts.month, day: day))
    }

    private static func weekParts(_ key: String, offset: Int) -> (month: Int, day: Int) {
        let parts = PeriodCalendar.dateParts(periodKey: key, dayOffset: offset)
        return (parts?.month ?? 1, parts?.day ?? 1)
    }

    private static func item(
        _ title: String,
        _ kind: PlanningItemKind,
        _ bucket: PlanningBucket,
        _ key: String,
        completed: Bool = false,
        symbol: String = "circle",
        color: String = "rose",
        month: Int? = nil,
        day: Int? = nil,
        minutes: Int? = nil,
        children: [PlanningNode] = []
    ) -> PlanningNode {
        PlanningNode(
            title: title,
            children: children,
            kind: kind,
            bucket: bucket,
            periodKey: key,
            completed: completed,
            iconSymbol: symbol,
            colorID: color,
            scheduleMonth: month,
            startDay: day,
            startMinutes: minutes,
            isSample: true
        )
    }

    @MainActor
    private static func seedDemoReflection(_ session: PlanningSession, bucket: PlanningBucket, key: String) {
        if session.periodRecords.contains(where: { $0.bucket == bucket && $0.periodKey == key }) { return }
        let rows: [(String, PlanningItemKind, Bool, ReflectionDisposition)] = [
            ("朝のストレッチ", .task, true, .keep),
            ("本を2冊読む", .task, true, .keep),
            ("部屋を整理する", .task, false, .postpone),
            ("チームミーティング", .event, true, .postpone),
            ("友人と食事", .event, true, .stop)
        ]
        let nodes = rows.map { title, kind, completed, disposition in
            PlanningNode(title: title, kind: kind, bucket: bucket, periodKey: key, completed: completed, reflectionDisposition: disposition, isSample: true)
        }
        session.periodItems.append(contentsOf: nodes)
        session.store(
            PeriodReflectionRecord(
                bucket: bucket,
                periodKey: key,
                hasMeaningfulActivity: true,
                reflectionOutstanding: false,
                reflectionCompleted: true,
                completedAt: Date(),
                decisions: nodes.map { node in
                    StoredReflectionDecision(
                        itemID: node.id,
                        logicalID: node.logicalID,
                        title: node.title,
                        kind: node.kind,
                        completed: node.completed,
                        disposition: node.reflectionDisposition ?? .keep,
                        eventID: node.eventID,
                        todayTaskID: node.todayTaskID
                    )
                },
                isSample: true
            )
        )
    }

    @MainActor
    private static func seedDailyTutorialReflection(_ session: PlanningSession, key: String) {
        if session.periodRecords.contains(where: { $0.bucket == .daily && $0.periodKey == key }) { return }
        let rows: [(String, PlanningItemKind, Bool)] = [
            ("今日の準備", .task, false),
            ("持ち物を確認", .task, false),
            ("会議", .event, false),
            ("資料を開く", .event, false)
        ]
        let nodes = rows.map { title, kind, completed in
            PlanningNode(title: title, kind: kind, bucket: .daily, periodKey: key, completed: completed, isSample: true)
        }
        session.periodItems.append(contentsOf: nodes)
        session.store(
            PeriodReflectionRecord(
                bucket: .daily,
                periodKey: key,
                hasMeaningfulActivity: true,
                reflectionOutstanding: true,
                reflectionCompleted: false,
                isSample: true,
                tutorialReflection: true
            )
        )
    }

    @MainActor
    private static func seedDemoPhoto(_ session: PlanningSession, bucket: PlanningBucket, key: String) {
        if session.periodRecords.contains(where: { $0.bucket == bucket && $0.periodKey == key }) { return }
        let scope = ReflectionScope.period(bucket, key)
        if session.memoryEntries.contains(where: { $0.scope == scope }) { return }
        session.addMemory(
            scope: scope,
            kind: .photoNote,
            text: "このカフェでノートを開いた瞬間、\nやりたいことが少しずつ見えてきた。",
            hasPhoto: true,
            imageData: demoSkyImage(),
            saved: true,
            isSample: true
        )
    }

    @MainActor
    private static func seedDemoDiary(_ session: PlanningSession, bucket: PlanningBucket, key: String) {
        if session.periodRecords.contains(where: { $0.bucket == bucket && $0.periodKey == key }) { return }
        let scope = ReflectionScope.period(bucket, key)
        if session.memoryEntries.contains(where: { $0.scope == scope }) { return }
        session.addMemory(
            scope: scope,
            kind: .diary,
            text: "今週は、仕事もプライベートもバタバタしていたけれど、なんとか乗り切れた気がする。\n\n忙しい中でも、好きな本を読む時間がとれてよかった。\n\n朝のストレッチも3日できて、少し体が軽くなったように感じる。\n\n友人と久しぶりに食事に行けて、たくさん話せて楽しかった。\n\n今週はうまくいかないこともあったけれど、それも含めていい経験になった。\n\n来週は、少し早めに寝ることと、読書の時間をもっとつくりたい。\n\n自分のペースで、ゆっくり進んでいこう。",
            hasPhoto: false,
            title: "なんでも日記",
            saved: true,
            isSample: true
        )
    }

    private static func demoSkyImage() -> Data {
        if let image = UIImage(named: "planning_photo_memory_sample"),
           let data = image.jpegData(compressionQuality: 0.9) {
            return data
        }
        return Data()
    }
}

extension PlanningSession {
    /// Rewrites known sample schedule dates that fall outside their period. User items are left alone.
    func repairSampleScheduleDates() {
        periodItems = repairedSampleDates(periodItems)
    }

    private func repairedSampleDates(_ nodes: [PlanningNode]) -> [PlanningNode] {
        nodes.map { node in
            var node = node
            node.children = repairedSampleDates(node.children)
            guard node.isSample, node.startDay != nil else { return node }
            guard !PeriodCalendar.sampleDateBelongs(bucket: node.bucket, periodKey: node.periodKey, month: node.scheduleMonth, day: node.startDay) else { return node }
            switch node.bucket {
            case .monthly:
                let parts = PeriodCalendar.monthParts(node.periodKey)
                node.scheduleMonth = parts.month
                node.startDay = PeriodCalendar.clampedDay(year: parts.year, month: parts.month, day: node.startDay ?? 1)
            case .daily:
                if let parts = PeriodCalendar.dateParts(periodKey: node.periodKey, dayOffset: 0) {
                    node.scheduleMonth = parts.month
                    node.startDay = parts.day
                }
            case .weekly:
                if let parts = PeriodCalendar.dateParts(periodKey: node.periodKey, dayOffset: 0) {
                    node.scheduleMonth = parts.month
                    node.startDay = parts.day
                }
            }
            return node
        }
    }
}
