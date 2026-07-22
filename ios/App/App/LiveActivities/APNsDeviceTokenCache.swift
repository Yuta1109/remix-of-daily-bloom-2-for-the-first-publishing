import Foundation

/// Survives the race where APNs delivers the device token before
/// `FirebaseMessagingPlugin.load()` registers its NotificationCenter observer.
///
/// Without this cache, `Messaging.messaging().apnsToken` stays nil → FCM
/// `getToken()` fails forever and Settings shows FCM✗ even when notifications
/// are allowed and Firestore (JS SDK) works.
enum APNsDeviceTokenCache {
    private static let defaultsKey = "essences.apnsDeviceToken"
    private static let lock = NSLock()
    private static var memory: Data?

    static func store(_ deviceToken: Data) {
        lock.lock()
        memory = deviceToken
        lock.unlock()
        UserDefaults.standard.set(deviceToken, forKey: defaultsKey)
    }

    static func current() -> Data? {
        lock.lock()
        let mem = memory
        lock.unlock()
        if let mem { return mem }
        return UserDefaults.standard.data(forKey: defaultsKey)
    }
}
