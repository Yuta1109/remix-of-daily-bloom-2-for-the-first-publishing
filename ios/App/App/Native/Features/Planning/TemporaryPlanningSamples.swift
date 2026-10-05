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
        let previousMonth = PeriodCalendar.shift(monthly, bucket: .monthly, by: -1)
        let previousWeek = PeriodCalendar.shift(weekly, bucket: .weekly, by: -1)

        session.monthlyPeriodKey = monthly
        session.weeklyPeriodKey = weekly
        session.dailyPeriodKey = daily

        session.postponed.append(contentsOf: [
            PostponedEntry(title: "資料の見直し", kind: .task, bucket: .monthly, isSample: true),
            PostponedEntry(title: "月次の打ち合わせ", kind: .event, bucket: .monthly, isSample: true),
            PostponedEntry(title: "週報の下書き", kind: .task, bucket: .weekly, isSample: true),
            PostponedEntry(title: "チーム昼食", kind: .event, bucket: .weekly, isSample: true),
            PostponedEntry(title: "メールの返信", kind: .task, bucket: .daily, isSample: true),
            PostponedEntry(title: "夕方の散歩", kind: .event, bucket: .daily, isSample: true)
        ])

        session.periodItems.append(contentsOf: [
            sampleParent(title: "健康的な生活", child: "朝のストレッチ", bucket: .monthly, key: monthly, kind: .task),
            sampleParent(title: "友人とランチ", child: "店を予約する", bucket: .monthly, key: monthly, kind: .event),
            sampleParent(title: "今週の集中作業", child: "企画メモ", bucket: .weekly, key: weekly, kind: .task),
            sampleParent(title: "週の打ち合わせ", child: "議題を送る", bucket: .weekly, key: weekly, kind: .event),
            sampleParent(title: "今日の準備", child: "持ち物を確認", bucket: .daily, key: daily, kind: .task),
            sampleParent(title: "会議", child: "資料を開く", bucket: .daily, key: daily, kind: .event)
        ]

        seedReflected(session, bucket: .monthly, key: previousMonth)
        seedReflected(session, bucket: .weekly, key: previousWeek)
        let yesterday = PeriodCalendar.shift(daily, bucket: .daily, by: -1)
        let twoDaysAgo = PeriodCalendar.shift(daily, bucket: .daily, by: -2)
        let threeDaysAgo = PeriodCalendar.shift(daily, bucket: .daily, by: -3)
        seedDemoReflection(session, key: yesterday)
        seedDemoPhoto(session, key: twoDaysAgo)
        seedDemoDiary(session, key: threeDaysAgo)
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

    private static func sampleParent(title: String, child: String, bucket: PlanningBucket, key: String, kind: PlanningItemKind) -> PlanningNode {
        PlanningNode(
            title: title,
            children: [PlanningNode(title: child, kind: kind, bucket: bucket, periodKey: key, isSample: true)],
            kind: kind,
            bucket: bucket,
            periodKey: key,
            isSample: true
        )
    }

    @MainActor
    private static func seedReflected(_ session: PlanningSession, bucket: PlanningBucket, key: String) {
        let kept = PlanningNode(title: "続けたこと", kind: .task, bucket: bucket, periodKey: key, completed: true, reflectionDisposition: .keep, isSample: true)
        let postponed = PlanningNode(title: "先送りしたこと", kind: .task, bucket: bucket, periodKey: key, completed: false, reflectionDisposition: .postpone, isSample: true)
        let stopped = PlanningNode(title: "終了したこと", kind: .event, bucket: bucket, periodKey: key, completed: true, reflectionDisposition: .stop, isSample: true)
        session.periodItems.append(contentsOf: [kept, postponed, stopped])
        session.store(
            PeriodReflectionRecord(
                bucket: bucket,
                periodKey: key,
                hasMeaningfulActivity: true,
                reflectionOutstanding: false,
                reflectionCompleted: true,
                isSample: true,
                completedAt: Date(),
                decisions: [kept, postponed, stopped].map { node in
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
                }
            )
        )
    }

    @MainActor
    private static func seedDemoReflection(_ session: PlanningSession, key: String) {
        let rows: [(String, PlanningItemKind, Bool, ReflectionDisposition)] = [
            ("朝の準備", .task, true, .keep),
            ("企画の続き", .task, true, .keep),
            ("夕方の確認", .task, false, .keep),
            ("資料の見直し", .task, false, .postpone),
            ("来週の打ち合わせ", .event, true, .postpone),
            ("終わった用事", .event, false, .stop)
        ]
        let nodes = rows.map { title, kind, completed, disposition in
            PlanningNode(title: title, kind: kind, bucket: .daily, periodKey: key, completed: completed, reflectionDisposition: disposition, isSample: true)
        }
        session.periodItems.append(contentsOf: nodes)
        session.store(
            PeriodReflectionRecord(
                bucket: .daily,
                periodKey: key,
                hasMeaningfulActivity: true,
                reflectionOutstanding: false,
                reflectionCompleted: true,
                isSample: true,
                completedAt: Date().addingTimeInterval(-86_400),
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
                }
            )
        )
    }

    @MainActor
    private static func seedDemoPhoto(_ session: PlanningSession, key: String) {
        session.addMemory(
            scope: .period(.daily, key),
            kind: .photoNote,
            text: "夕方の空がきれいだった。",
            hasPhoto: true,
            imageData: demoSkyImage(),
            saved: true,
            isSample: true
        )
    }

    @MainActor
    private static func seedDemoDiary(_ session: PlanningSession, key: String) {
        session.addMemory(
            scope: .period(.daily, key),
            kind: .diary,
            text: "今日は少し早めに作業を切り上げて、ゆっくり過ごした。\nやることは全部終わらなかったけれど、一度立ち止まれたのはよかった。\n明日は一つずつ進めたい。",
            hasPhoto: false,
            title: "少し落ち着けた日",
            saved: true,
            isSample: true
        )
    }

    private static func demoSkyImage() -> Data {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 120, height: 80))
        let image = renderer.image { context in
            UIColor(red: 0.96, green: 0.62, blue: 0.38, alpha: 1).setFill()
            context.fill(CGRect(x: 0, y: 0, width: 120, height: 80))
            UIColor(red: 0.45, green: 0.62, blue: 0.86, alpha: 1).setFill()
            context.fill(CGRect(x: 0, y: 0, width: 120, height: 36))
        }
        return image.pngData() ?? Data()
    }
}
