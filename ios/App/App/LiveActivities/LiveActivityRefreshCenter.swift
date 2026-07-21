import Foundation
import ActivityKit

extension Notification.Name {
    /// Posted when an active Live Activity emits an APNs update push token (hex).
    static let essencesLiveActivityUpdateToken = Notification.Name("EssencesLiveActivityUpdateToken")
}

/// Keeps Lock Screen relative countdown fresh without `Text(timerInterval:)`.
///
/// 1. Heartbeat: every ~60s re-`update`s active activities with an incremented
///    `tick` so SwiftUI rebuilds (works while the app process is alive).
/// 2. Observes per-activity `pushTokenUpdates` so JS can upload the token for
///    remote FCM `event: "update"` refreshes when the app is killed.
@available(iOS 16.2, *)
enum LiveActivityRefreshCenter {
    private static var heartbeat: Task<Void, Never>?
    private static var tokenWatchers: [String: Task<Void, Never>] = [:]
    private static let lock = NSLock()

    static func start() {
        lock.lock()
        let running = heartbeat != nil
        lock.unlock()
        if !running {
            startHeartbeat()
        }
        watchExistingActivities()
    }

    /// Call after request/update so new activities get token watchers.
    static func noteActivitiesChanged() {
        watchExistingActivities()
    }

    private static func startHeartbeat() {
        let task = Task.detached(priority: .utility) {
            // Immediate first refresh so Lock Screen is not stuck on the initial label.
            await bumpTicks()
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 60_000_000_000)
                await bumpTicks()
            }
        }
        lock.lock()
        heartbeat = task
        lock.unlock()
    }

    private static func watchExistingActivities() {
        for activity in Activity<EssencesWidgetAttributes>.activities {
            watchPushToken(for: activity)
        }
    }

    private static func watchPushToken(for activity: Activity<EssencesWidgetAttributes>) {
        lock.lock()
        let already = tokenWatchers[activity.id] != nil
        lock.unlock()
        if already { return }

        let id = activity.id
        let task = Task.detached(priority: .utility) {
            for await tokenData in activity.pushTokenUpdates {
                let token = tokenData.map { String(format: "%02x", $0) }.joined()
                NotificationCenter.default.post(
                    name: .essencesLiveActivityUpdateToken,
                    object: nil,
                    userInfo: ["token": token, "activityId": id]
                )
            }
            lock.lock()
            tokenWatchers[id] = nil
            lock.unlock()
        }
        lock.lock()
        tokenWatchers[id] = task
        lock.unlock()
    }

    private static func bumpTicks() async {
        for activity in Activity<EssencesWidgetAttributes>.activities {
            let current = activity.content.state
            let next = EssencesWidgetAttributes.ContentState(
                items: current.items,
                overflow: current.overflow,
                locale: current.locale,
                tick: current.tick &+ 1,
                phase: current.phase
            )
            await activity.update(
                ActivityContent(state: next, staleDate: activity.content.staleDate)
            )
        }
    }
}
