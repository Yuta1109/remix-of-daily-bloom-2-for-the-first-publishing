import Foundation
import Capacitor
import ActivityKit

/// Capacitor bridge for Lock Screen Live Activities.
/// JS name: `LiveActivities` (see src/lib/live-activity.ts).
///
/// - Foreground start/update when already inside the lead window (e.g. lead 4h,
///   event in 3h → start immediately on save).
/// - push-to-start token observation via `LiveActivityPushTokenCenter` (iOS 17.2+).
@objc(LiveActivitiesPlugin)
public class LiveActivitiesPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveActivitiesPlugin"
    public let jsName = "LiveActivities"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "areEnabled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startOrUpdate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endAll", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startPushToStartTokenUpdates", returnType: CAPPluginReturnPromise),
    ]

    private var endWorkItem: DispatchWorkItem?
    private var tokenObserver: NSObjectProtocol?

    public override func load() {
        super.load()
        tokenObserver = NotificationCenter.default.addObserver(
            forName: .essencesPushToStartToken,
            object: nil,
            queue: .main
        ) { [weak self] note in
            guard let token = note.userInfo?["token"] as? String else { return }
            self?.notifyListeners("pushToStartToken", data: ["token": token])
        }
        LiveActivityPushTokenCenter.start()
    }

    deinit {
        if let tokenObserver {
            NotificationCenter.default.removeObserver(tokenObserver)
        }
    }

    @objc func areEnabled(_ call: CAPPluginCall) {
        if #available(iOS 16.1, *) {
            call.resolve(["enabled": ActivityAuthorizationInfo().areActivitiesEnabled])
        } else {
            call.resolve(["enabled": false])
        }
    }

    @objc func startPushToStartTokenUpdates(_ call: CAPPluginCall) {
        guard #available(iOS 17.2, *) else {
            call.resolve()
            return
        }
        LiveActivityPushTokenCenter.start()
        if let token = LiveActivityPushTokenCenter.currentToken {
            notifyListeners("pushToStartToken", data: ["token": token])
        }
        call.resolve()
    }

    @objc func startOrUpdate(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.resolve(["activityId": NSNull()])
            return
        }

        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            call.resolve(["activityId": NSNull()])
            return
        }

        let locale = call.getString("locale", "en")
        let overflow = call.getInt("overflow", 0)
        guard let rawItems = call.getArray("items") as? [[String: Any]] else {
            call.reject("Invalid items payload")
            return
        }

        var items: [EssencesWidgetAttributes.Item] = []
        for obj in rawItems {
            let title = obj["title"] as? String ?? ""
            let start: Double
            if let d = obj["startEpochMs"] as? Double {
                start = d
            } else if let n = obj["startEpochMs"] as? NSNumber {
                start = n.doubleValue
            } else {
                start = 0
            }
            let color = obj["color"] as? String ?? "blue"
            items.append(.init(title: title, startEpochMs: start, color: color))
        }

        guard !items.isEmpty else {
            Task { await self.endAllActivities() }
            call.resolve(["activityId": NSNull()])
            return
        }

        let state = EssencesWidgetAttributes.ContentState(
            items: items,
            overflow: overflow,
            locale: locale
        )

        let earliestStart: Date? = {
            guard let earliest = items.map(\.startEpochMs).min(), earliest > 0 else {
                return nil
            }
            return Date(timeIntervalSince1970: earliest / 1000.0)
        }()

        let endDate: Date = {
            if let endMs = call.getDouble("endEpochMs"), endMs > 0 {
                return Date(timeIntervalSince1970: endMs / 1000.0)
            }
            return earliestStart ?? Date().addingTimeInterval(60)
        }()

        let staleDate = earliestStart
        let relevance: Double = {
            guard let start = earliestStart else { return 0 }
            let hours = max(0, start.timeIntervalSinceNow / 3600.0)
            return max(0, 100.0 - hours)
        }()

        Task {
            do {
                let activityId = try await self.apply(
                    state: state,
                    staleDate: staleDate,
                    relevanceScore: relevance
                )
                self.scheduleEnd(at: endDate)
                call.resolve(["activityId": activityId as Any])
            } catch {
                call.reject("Live Activity error: \(error.localizedDescription)")
            }
        }
    }

    @objc func endAll(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.resolve()
            return
        }
        endWorkItem?.cancel()
        endWorkItem = nil
        Task {
            await self.endAllActivities()
            call.resolve()
        }
    }

    @available(iOS 16.1, *)
    private func apply(
        state: EssencesWidgetAttributes.ContentState,
        staleDate: Date?,
        relevanceScore: Double
    ) async throws -> String {
        if let existing = Activity<EssencesWidgetAttributes>.activities.first {
            if #available(iOS 16.2, *) {
                await existing.update(
                    ActivityContent(
                        state: state,
                        staleDate: staleDate,
                        relevanceScore: relevanceScore
                    )
                )
            } else {
                await existing.update(using: state)
            }
            return existing.id
        }

        // Prefer .token for later push updates. If APNs/push entitlement is not
        // ready, Activity.request(..., pushType: .token) can fail entirely and
        // the Lock Screen never appears — fall back to a local-only activity.
        if #available(iOS 16.2, *) {
            let content = ActivityContent(
                state: state,
                staleDate: staleDate,
                relevanceScore: relevanceScore
            )
            let attrs = EssencesWidgetAttributes(name: "Essences")
            do {
                let activity = try Activity.request(
                    attributes: attrs,
                    content: content,
                    pushType: .token
                )
                return activity.id
            } catch {
                let activity = try Activity.request(
                    attributes: attrs,
                    content: content,
                    pushType: nil
                )
                return activity.id
            }
        } else {
            let attrs = EssencesWidgetAttributes(name: "Essences")
            do {
                let activity = try Activity.request(
                    attributes: attrs,
                    contentState: state,
                    pushType: .token
                )
                return activity.id
            } catch {
                let activity = try Activity.request(
                    attributes: attrs,
                    contentState: state,
                    pushType: nil
                )
                return activity.id
            }
        }
    }

    @available(iOS 16.1, *)
    private func endAllActivities() async {
        for activity in Activity<EssencesWidgetAttributes>.activities {
            if #available(iOS 16.2, *) {
                await activity.end(nil, dismissalPolicy: .immediate)
            } else {
                await activity.end(dismissalPolicy: .immediate)
            }
        }
    }

    private func scheduleEnd(at date: Date) {
        endWorkItem?.cancel()
        let delay = date.timeIntervalSinceNow
        if delay <= 0 {
            if #available(iOS 16.1, *) {
                Task { await self.endAllActivities() }
            }
            return
        }
        let capped = min(delay, 8 * 60 * 60)
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            if #available(iOS 16.1, *) {
                Task { await self.endAllActivities() }
            }
        }
        endWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + capped, execute: work)
    }
}
