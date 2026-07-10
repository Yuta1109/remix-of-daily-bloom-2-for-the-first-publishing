import Foundation
import Capacitor
import ActivityKit

/// Capacitor bridge for Lock Screen Live Activities.
/// JS name: `LiveActivities` (see src/lib/live-activity.ts).
@objc(LiveActivitiesPlugin)
public class LiveActivitiesPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveActivitiesPlugin"
    public let jsName = "LiveActivities"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "areEnabled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startOrUpdate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endAll", returnType: CAPPluginReturnPromise),
    ]

    @objc func areEnabled(_ call: CAPPluginCall) {
        if #available(iOS 16.1, *) {
            call.resolve(["enabled": ActivityAuthorizationInfo().areActivitiesEnabled])
        } else {
            call.resolve(["enabled": false])
        }
    }

    @objc func startOrUpdate(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.resolve(["activityId": NSNull()])
            return
        }

        let locale = call.getString("locale") ?? "en"
        let overflow = call.getInt("overflow") ?? 0
        let rawItems = call.getArray("items") ?? []

        var items: [EssentialsWidgetAttributes.Item] = []
        for entry in rawItems {
            guard let obj = entry as? [String: Any] else { continue }
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

        let state = EssentialsWidgetAttributes.ContentState(
            items: items,
            overflow: overflow,
            locale: locale
        )

        Task {
            if let existing = Activity<EssentialsWidgetAttributes>.activities.first {
                await existing.update(using: state)
                call.resolve(["activityId": existing.id])
                return
            }
            do {
                let activity = try Activity.request(
                    attributes: EssentialsWidgetAttributes(name: "Essentials"),
                    contentState: state,
                    pushType: nil
                )
                call.resolve(["activityId": activity.id])
            } catch {
                call.reject("Failed to start Live Activity: \(error.localizedDescription)")
            }
        }
    }

    @objc func endAll(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.resolve()
            return
        }
        Task {
            for activity in Activity<EssentialsWidgetAttributes>.activities {
                await activity.end(dismissalPolicy: .immediate)
            }
            call.resolve()
        }
    }
}
