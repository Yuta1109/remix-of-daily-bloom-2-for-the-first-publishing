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
        ])

        for bucket in [PlanningBucket.monthly, .weekly, .daily] {
            let current = PeriodCalendar.currentKey(bucket, now: now)
            seedDemoReflection(session, bucket: bucket, key: PeriodCalendar.shift(current, bucket: bucket, by: -1))
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
    private static func seedDemoPhoto(_ session: PlanningSession, bucket: PlanningBucket, key: String) {
        if session.periodRecords.contains(where: { $0.bucket == bucket && $0.periodKey == key }) { return }
        let scope = ReflectionScope.period(bucket, key)
        if session.memoryEntries.contains(where: { $0.scope == scope }) { return }
        session.addMemory(
            scope: scope,
            kind: .photoNote,
            text: "その日の写真を1枚選び、一言だけ残せる記録です。",
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
            text: "なんでも日記は、形式を決めずにその日・週・月の出来事や考えたことを自由に残すための記録です。短くても長くてもかまいません。振り返りでは書ききれないことを、自分の言葉で残したいときに使えます。",
            hasPhoto: false,
            title: "なんでも日記（例）",
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
