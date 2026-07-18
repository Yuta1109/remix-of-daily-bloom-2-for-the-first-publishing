import Foundation
import ActivityKit

extension Notification.Name {
    /// Posted whenever ActivityKit emits a push-to-start token (hex string in userInfo["token"]).
    static let essencesPushToStartToken = Notification.Name("EssencesPushToStartToken")
}

/// Long-lived owner of the ActivityKit `pushToStartTokenUpdates` Task.
///
/// Holding the Task only on a CAPPlugin (or a local function) lets the system
/// cancel it when the bridge/plugin tears down in background — a common cause
/// of missing push-to-start tokens on device. This center is started from
/// AppDelegate and keeps a strong Task for the process lifetime.
enum LiveActivityPushTokenCenter {
    private static var task: Task<Void, Never>?
    private static var lastToken: String?
    private static let lock = NSLock()

    static var currentToken: String? {
        lock.lock()
        defer { lock.unlock() }
        return lastToken
    }

    static func start() {
        if #available(iOS 17.2, *) {
            startObserving()
        }
    }

    @available(iOS 17.2, *)
    private static func startObserving() {
        lock.lock()
        let alreadyRunning = task != nil
        let cached = lastToken
        lock.unlock()

        if alreadyRunning {
            if let cached {
                NotificationCenter.default.post(
                    name: .essencesPushToStartToken,
                    object: nil,
                    userInfo: ["token": cached]
                )
            }
            return
        }

        let newTask = Task.detached(priority: .utility) {
            for await tokenData in Activity<EssencesWidgetAttributes>.pushToStartTokenUpdates {
                let token = tokenData.map { String(format: "%02x", $0) }.joined()
                lock.lock()
                lastToken = token
                lock.unlock()
                NotificationCenter.default.post(
                    name: .essencesPushToStartToken,
                    object: nil,
                    userInfo: ["token": token]
                )
            }
        }

        lock.lock()
        if task == nil {
            task = newTask
        } else {
            newTask.cancel()
        }
        lock.unlock()
    }
}
