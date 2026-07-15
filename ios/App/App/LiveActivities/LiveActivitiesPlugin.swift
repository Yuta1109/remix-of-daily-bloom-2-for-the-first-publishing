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

        let state = EssencesWidgetAttributes.ContentState(
            items: items,
            overflow: overflow,
            locale: locale
        )

        let staleDate: Date? = {
            guard let earliest = items.map(\.startEpochMs).min(), earliest > 0 else {
                return nil
            }
            return Date(timeIntervalSince1970: earliest / 1000.0)
        }()

        Task {
            do {
                if let existing = Activity<EssencesWidgetAttributes>.activities.first {
                    if #available(iOS 16.2, *) {
                        await existing.update(
                            ActivityContent(state: state, staleDate: staleDate)
                        )
                    } else {
                        await existing.update(using: state)
                    }
                    call.resolve(["activityId": existing.id])
                    return
                }

                let activity: Activity<EssencesWidgetAttributes>
                if #available(iOS 16.2, *) {
                    activity = try Activity.request(
                        attributes: EssencesWidgetAttributes(name: "Essences"),
                        content: ActivityContent(state: state, staleDate: staleDate),
                        pushType: nil
                    )
                } else {
                    activity = try Activity.request(
                        attributes: EssencesWidgetAttributes(name: "Essences"),
                        contentState: state,
                        pushType: nil
                    )
                }
                call.resolve(["activityId": activity.id])
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
        Task {
            for activity in Activity<EssencesWidgetAttributes>.activities {
                if #available(iOS 16.2, *) {
                    await activity.end(nil, dismissalPolicy: .immediate)
                } else {
                    await activity.end(dismissalPolicy: .immediate)
                }
            }
            call.resolve()
        }
    }
}
