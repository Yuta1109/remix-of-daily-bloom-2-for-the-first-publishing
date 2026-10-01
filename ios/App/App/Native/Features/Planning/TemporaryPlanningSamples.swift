import Foundation

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
        let previousDay = PeriodCalendar.shift(daily, bucket: .daily, by: -1)

        session.monthlyPeriodKey = monthly
        session.weeklyPeriodKey = weekly
        session.dailyPeriodKey = daily

        session.postponed = [
            PostponedEntry(title: "資料の見直し", kind: .task, bucket: .monthly),
            PostponedEntry(title: "月次の打ち合わせ", kind: .event, bucket: .monthly),
            PostponedEntry(title: "週報の下書き", kind: .task, bucket: .weekly),
            PostponedEntry(title: "チーム昼食", kind: .event, bucket: .weekly),
            PostponedEntry(title: "メールの返信", kind: .task, bucket: .daily),
            PostponedEntry(title: "夕方の散歩", kind: .event, bucket: .daily)
        ]

        session.periodItems = [
            sampleParent(title: "健康的な生活", child: "朝のストレッチ", bucket: .monthly, key: monthly, kind: .task),
            sampleParent(title: "友人とランチ", child: "店を予約する", bucket: .monthly, key: monthly, kind: .event),
            sampleParent(title: "今週の集中作業", child: "企画メモ", bucket: .weekly, key: weekly, kind: .task),
            sampleParent(title: "週の打ち合わせ", child: "議題を送る", bucket: .weekly, key: weekly, kind: .event),
            sampleParent(title: "今日の準備", child: "持ち物を確認", bucket: .daily, key: daily, kind: .task),
            sampleParent(title: "会議", child: "資料を開く", bucket: .daily, key: daily, kind: .event)
        ]

        seedReflected(session, bucket: .monthly, key: previousMonth)
        seedReflected(session, bucket: .weekly, key: previousWeek)
        seedReflected(session, bucket: .daily, key: previousDay)
    }

    private static func sampleParent(title: String, child: String, bucket: PlanningBucket, key: String, kind: PlanningItemKind) -> PlanningNode {
        PlanningNode(
            title: title,
            children: [PlanningNode(title: child, kind: kind, bucket: bucket, periodKey: key)],
            kind: kind,
            bucket: bucket,
            periodKey: key
        )
    }

    @MainActor
    private static func seedReflected(_ session: PlanningSession, bucket: PlanningBucket, key: String) {
        let kept = PlanningNode(title: "続けたこと", kind: .task, bucket: bucket, periodKey: key, completed: true, reflectionDisposition: .keep)
        let postponed = PlanningNode(title: "先送りしたこと", kind: .task, bucket: bucket, periodKey: key, completed: false, reflectionDisposition: .postpone)
        let stopped = PlanningNode(title: "終了したこと", kind: .event, bucket: bucket, periodKey: key, completed: true, reflectionDisposition: .stop)
        session.periodItems.append(contentsOf: [kept, postponed, stopped])
        session.store(
            PeriodReflectionRecord(
                bucket: bucket,
                periodKey: key,
                hasMeaningfulActivity: true,
                reflectionOutstanding: false,
                reflectionCompleted: true,
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
}
