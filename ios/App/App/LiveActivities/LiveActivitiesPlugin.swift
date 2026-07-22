import Foundation
import Capacitor
import ActivityKit
import UIKit

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
        CAPPluginMethod(name: "getPushToStartToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getUpdateToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getTokenDebugInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "rebroadcastApnsToken", returnType: CAPPluginReturnPromise),
    ]

    private var endWorkItem: DispatchWorkItem?
    private var arrivedWorkItem: DispatchWorkItem?
    private var tokenObserver: NSObjectProtocol?
    private var updateTokenObserver: NSObjectProtocol?

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
        updateTokenObserver = NotificationCenter.default.addObserver(
            forName: .essencesLiveActivityUpdateToken,
            object: nil,
            queue: .main
        ) { [weak self] note in
            guard let token = note.userInfo?["token"] as? String else { return }
            self?.notifyListeners("liveActivityUpdateToken", data: ["token": token])
        }
        LiveActivityPushTokenCenter.start()
        if #available(iOS 16.2, *) {
            LiveActivityRefreshCenter.start()
        }
    }

    deinit {
        if let tokenObserver {
            NotificationCenter.default.removeObserver(tokenObserver)
        }
        if let updateTokenObserver {
            NotificationCenter.default.removeObserver(updateTokenObserver)
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

    @objc func getPushToStartToken(_ call: CAPPluginCall) {
        guard #available(iOS 17.2, *) else {
            call.resolve(["token": NSNull()])
            return
        }
        LiveActivityPushTokenCenter.start()
        if let token = LiveActivityPushTokenCenter.currentToken {
            call.resolve(["token": token])
        } else {
            call.resolve(["token": NSNull()])
        }
    }

    @objc func getUpdateToken(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            LiveActivityRefreshCenter.start()
            LiveActivityRefreshCenter.rebroadcastCachedUpdateToken()
            if let token = LiveActivityRefreshCenter.currentUpdateToken {
                call.resolve(["token": token])
            } else {
                call.resolve(["token": NSNull()])
            }
        } else {
            call.resolve(["token": NSNull()])
        }
    }

    /// Snapshot for Settings / Gemini debugging (APNs cache, LA enablement, etc.).
    @objc func getTokenDebugInfo(_ call: CAPPluginCall) {
        var info = APNsDeviceTokenCache.debugDictionary()
        info["iosVersion"] = UIDevice.current.systemVersion
        if #available(iOS 16.1, *) {
            info["activitiesEnabled"] = ActivityAuthorizationInfo().areActivitiesEnabled
            info["activeActivityCount"] = Activity<EssencesWidgetAttributes>.activities.count
        } else {
            info["activitiesEnabled"] = false
            info["activeActivityCount"] = 0
        }
        if #available(iOS 17.2, *) {
            let pts = LiveActivityPushTokenCenter.currentToken
            info["hasPushToStartToken"] = pts != nil
            info["pushToStartPrefix"] = pts.map { String($0.prefix(12)) } as Any
        } else {
            info["hasPushToStartToken"] = false
            info["pushToStartPrefix"] = NSNull()
            info["pushToStartNote"] = "iOS < 17.2"
        }
        if #available(iOS 16.2, *) {
            let update = LiveActivityRefreshCenter.currentUpdateToken
            info["hasUpdateToken"] = update != nil
            info["updateTokenPrefix"] = update.map { String($0.prefix(12)) } as Any
            info["laStartedWithoutPush"] = LiveActivityRefreshCenter.startedWithoutPush
        } else {
            info["hasUpdateToken"] = false
            info["laStartedWithoutPush"] = NSNull()
        }
        call.resolve(info)
    }

    /// Force Capacitor Firebase Messaging to see the cached APNs device token again.
    @objc func rebroadcastApnsToken(_ call: CAPPluginCall) {
        UIApplication.shared.registerForRemoteNotifications()
        let ok = APNsDeviceTokenCache.rebroadcastToCapacitor()
        if #available(iOS 16.2, *) {
            LiveActivityRefreshCenter.rebroadcastCachedUpdateToken()
        }
        call.resolve([
            "rebroadcast": ok,
            "apnsCacheBytes": APNsDeviceTokenCache.current()?.count ?? 0,
            "apnsRegisterError": APNsDeviceTokenCache.lastError() as Any,
        ])
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
            locale: locale,
            tick: 0,
            phase: call.getString("phase", "countdown")
        )

        let earliestStart: Date? = {
            guard let earliest = items.map(\.startEpochMs).min(), earliest > 0 else {
                return nil
            }
            return Date(timeIntervalSince1970: earliest / 1000.0)
        }()

        // Linger 1 minute past event start so Lock Screen can show "It's time",
        // then the row is dropped (staleDate / end).
        let endDate: Date = {
            if let endMs = call.getDouble("endEpochMs"), endMs > 0 {
                return Date(timeIntervalSince1970: endMs / 1000.0)
            }
            if let start = earliestStart {
                return start.addingTimeInterval(60)
            }
            return Date().addingTimeInterval(60)
        }()

        let staleDate = endDate
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
                if #available(iOS 16.2, *) {
                    LiveActivityRefreshCenter.start()
                    LiveActivityRefreshCenter.noteActivitiesChanged()
                }
                if let start = earliestStart {
                    self.scheduleArrived(at: start, locale: locale)
                }
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
        let apnsReady = APNsDeviceTokenCache.current() != nil
        var needsPushRelaunch = false
        if #available(iOS 16.2, *) {
            needsPushRelaunch = await LiveActivityRefreshCenter.shouldRelaunchForPush(apnsReady: apnsReady)
        }

        if needsPushRelaunch {
            NSLog("[Essences LA] Recreating Live Activity with pushType:.token (missing updateToken)")
            await endAllActivities()
        } else if !Activity<EssencesWidgetAttributes>.activities.isEmpty {
            // Collapse duplicates from repeated remote push-to-start, then update one.
            let activities = Activity<EssencesWidgetAttributes>.activities
            let keeper = activities[0]
            if activities.count > 1 {
                NSLog("[Essences LA] Ending %d duplicate Live Activities", activities.count - 1)
                for activity in activities.dropFirst() {
                    if #available(iOS 16.2, *) {
                        await activity.end(nil, dismissalPolicy: .immediate)
                    } else {
                        await activity.end(dismissalPolicy: .immediate)
                    }
                }
            }
            if #available(iOS 16.2, *) {
                await keeper.update(
                    ActivityContent(
                        state: state,
                        staleDate: staleDate,
                        relevanceScore: relevanceScore
                    )
                )
                LiveActivityRefreshCenter.noteActivitiesChanged()
                LiveActivityRefreshCenter.rebroadcastCachedUpdateToken()
            } else {
                await keeper.update(using: state)
            }
            return keeper.id
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
                LiveActivityRefreshCenter.markStartedWithPush()
                LiveActivityRefreshCenter.noteActivitiesChanged()
                _ = await LiveActivityRefreshCenter.waitForUpdateToken(timeoutMs: 4000)
                return activity.id
            } catch {
                NSLog("[Essences LA] Activity.request(pushType:.token) failed: \(error.localizedDescription) — falling back to local-only (no updateToken)")
                let activity = try Activity.request(
                    attributes: attrs,
                    content: content,
                    pushType: nil
                )
                LiveActivityRefreshCenter.markStartedWithoutPush()
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

    private func scheduleArrived(at date: Date, locale: String) {
        arrivedWorkItem?.cancel()
        let delay = date.timeIntervalSinceNow
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            if #available(iOS 16.2, *) {
                Task {
                    for activity in Activity<EssencesWidgetAttributes>.activities {
                        let cur = activity.content.state
                        // Per-row UI uses each item's startDate; bump tick so TimelineView redraws.
                        let next = EssencesWidgetAttributes.ContentState(
                            items: cur.items,
                            overflow: cur.overflow,
                            locale: locale.isEmpty ? cur.locale : locale,
                            tick: cur.tick &+ 1,
                            phase: cur.phase
                        )
                        await activity.update(
                            ActivityContent(state: next, staleDate: activity.content.staleDate)
                        )
                    }
                }
            }
        }
        arrivedWorkItem = work
        if delay <= 0 {
            DispatchQueue.main.async(execute: work)
        } else {
            DispatchQueue.main.asyncAfter(deadline: .now() + min(delay, 8 * 60 * 60), execute: work)
        }
    }

    private func scheduleEnd(at date: Date) {
        endWorkItem?.cancel()
        var delay = date.timeIntervalSinceNow
        // Never schedule an immediate teardown right after request/update —
        // that was wiping brand-new Live Activities when staleDate was skewed.
        if delay < 5 {
            delay = 60
        }
        let capped = min(delay, 8 * 60 * 60)
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            if #available(iOS 16.1, *) {
                Task {
                    // Keep the card if any row is still counting down.
                    let stillCounting = Activity<EssencesWidgetAttributes>.activities.contains { activity in
                        activity.content.state.items.contains { $0.startDate > Date() }
                    }
                    if stillCounting { return }
                    await self.endAllActivities()
                }
            }
        }
        endWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + capped, execute: work)
    }
}
