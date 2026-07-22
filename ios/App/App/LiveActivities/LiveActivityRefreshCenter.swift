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
    private static let localOnlyKey = "essences.laStartedWithoutPush"
    private static let updateTokenKey = "essences.laUpdateToken"

    private static var heartbeat: Task<Void, Never>?
    private static var tokenWatchers: [String: Task<Void, Never>] = [:]
    private static var lastUpdateToken: String?
    private static var didAttemptPushRelaunchThisProcess = false
    private static let lock = NSLock()

    static var currentUpdateToken: String? {
        lock.lock()
        let mem = lastUpdateToken
        lock.unlock()
        if let mem { return mem }
        return UserDefaults.standard.string(forKey: updateTokenKey)
    }

    static var startedWithoutPush: Bool {
        get { UserDefaults.standard.bool(forKey: localOnlyKey) }
        set { UserDefaults.standard.set(newValue, forKey: localOnlyKey) }
    }

    static func start() {
        lock.lock()
        let running = heartbeat != nil
        lock.unlock()
        if !running {
            startHeartbeat()
        }
        watchExistingActivities()
        rebroadcastCachedUpdateToken()
    }

    /// Call after request/update so new activities get token watchers.
    static func noteActivitiesChanged() {
        watchExistingActivities()
    }

    static func markStartedWithPush() {
        startedWithoutPush = false
    }

    static func markStartedWithoutPush() {
        startedWithoutPush = true
        lock.lock()
        lastUpdateToken = nil
        lock.unlock()
        UserDefaults.standard.removeObject(forKey: updateTokenKey)
    }

    /// True when we should end a running activity and request again with pushType:.token.
    static func shouldRelaunchForPush(apnsReady: Bool) async -> Bool {
        guard apnsReady else { return false }
        guard !Activity<EssencesWidgetAttributes>.activities.isEmpty else { return false }
        if currentUpdateToken != nil { return false }

        noteActivitiesChanged()
        _ = await waitForUpdateToken(timeoutMs: 2500)
        if currentUpdateToken != nil { return false }

        lock.lock()
        if didAttemptPushRelaunchThisProcess {
            lock.unlock()
            return false
        }
        didAttemptPushRelaunchThisProcess = true
        lock.unlock()
        return true
    }

    static func rebroadcastCachedUpdateToken() {
        guard let token = currentUpdateToken else { return }
        NotificationCenter.default.post(
            name: .essencesLiveActivityUpdateToken,
            object: nil,
            userInfo: ["token": token]
        )
    }

    /// Wait briefly for ActivityKit to emit an update push token after request.
    static func waitForUpdateToken(timeoutMs: Int = 4000) async -> String? {
        let deadline = Date().addingTimeInterval(Double(timeoutMs) / 1000.0)
        while Date() < deadline {
            if let token = currentUpdateToken { return token }
            noteActivitiesChanged()
            try? await Task.sleep(nanoseconds: 150_000_000)
        }
        return currentUpdateToken
    }

    private static func storeUpdateToken(_ token: String, activityId: String) {
        lock.lock()
        lastUpdateToken = token
        lock.unlock()
        UserDefaults.standard.set(token, forKey: updateTokenKey)
        startedWithoutPush = false
        NSLog("[Essences LA] updateToken received for \(activityId) (\(token.count / 2) bytes)")
        NotificationCenter.default.post(
            name: .essencesLiveActivityUpdateToken,
            object: nil,
            userInfo: ["token": token, "activityId": activityId]
        )
    }

    private static func startHeartbeat() {
        let task = Task.detached(priority: .utility) {
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
        let ids = Set(Activity<EssencesWidgetAttributes>.activities.map(\.id))
        lock.lock()
        for (id, task) in tokenWatchers where !ids.contains(id) {
            task.cancel()
            tokenWatchers[id] = nil
        }
        lock.unlock()

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
                storeUpdateToken(token, activityId: id)
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
