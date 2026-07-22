import UIKit
import UserNotifications
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Start ActivityKit push-to-start token observation early and keep the
        // Task alive for the process lifetime (see LiveActivityPushTokenCenter).
        LiveActivityPushTokenCenter.start()
        if #available(iOS 16.2, *) {
            LiveActivityRefreshCenter.start()
        }
        // Always request the APNs device token. FCM getToken() needs it; waiting
        // only for "authorized" delayed registration and left Settings at FCM✗.
        application.registerForRemoteNotifications()
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        application.registerForRemoteNotifications()
        if #available(iOS 16.2, *) {
            LiveActivityRefreshCenter.start()
            LiveActivityRefreshCenter.noteActivitiesChanged()
        }
        // Re-broadcast cached push-to-start so JS listeners attached after the
        // first ActivityKit emission still receive a token.
        LiveActivityPushTokenCenter.start()
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    // MARK: - Remote notifications (FCM / Live Activity push-to-start)

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        // Cache first — Capacitor Firebase Messaging may not be listening yet.
        APNsDeviceTokenCache.store(deviceToken)
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
        // Second post after a beat in case the plugin observer registered mid-flight.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            NotificationCenter.default.post(
                name: .capacitorDidRegisterForRemoteNotifications,
                object: deviceToken
            )
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            _ = APNsDeviceTokenCache.rebroadcastToCapacitor()
        }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        APNsDeviceTokenCache.storeFailure(error)
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
        NSLog("[Essences] APNs registration failed: \(error.localizedDescription)")
    }

    func application(_ application: UIApplication, didReceiveRemoteNotification userInfo: [AnyHashable: Any], fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
        NotificationCenter.default.post(
            name: Notification.Name("didReceiveRemoteNotification"),
            object: completionHandler,
            userInfo: userInfo
        )
    }
}
