import Foundation
import Capacitor

/// Survives the race where APNs delivers the device token before
/// `FirebaseMessagingPlugin.load()` registers its NotificationCenter observer.
///
/// Without this cache, `Messaging.messaging().apnsToken` stays nil → FCM
/// `getToken()` fails forever and Settings shows FCM✗ even when notifications
/// are allowed and Firestore (JS SDK) works.
enum APNsDeviceTokenCache {
    private static let defaultsKey = "essences.apnsDeviceToken"
    private static let errorKey = "essences.apnsRegisterError"
    private static let okAtKey = "essences.apnsRegisterOkAt"
    private static let failAtKey = "essences.apnsRegisterFailAt"
    private static let lock = NSLock()
    private static var memory: Data?

    static func store(_ deviceToken: Data) {
        lock.lock()
        memory = deviceToken
        lock.unlock()
        UserDefaults.standard.set(deviceToken, forKey: defaultsKey)
        UserDefaults.standard.removeObject(forKey: errorKey)
        UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: okAtKey)
    }

    static func storeFailure(_ error: Error) {
        UserDefaults.standard.set(error.localizedDescription, forKey: errorKey)
        UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: failAtKey)
    }

    static func current() -> Data? {
        lock.lock()
        let mem = memory
        lock.unlock()
        if let mem { return mem }
        return UserDefaults.standard.data(forKey: defaultsKey)
    }

    static func lastError() -> String? {
        UserDefaults.standard.string(forKey: errorKey)
    }

    static func debugDictionary() -> [String: Any] {
        let token = current()
        let hexPrefix: Any
        if let token {
            hexPrefix = token.prefix(6).map { String(format: "%02x", $0) }.joined()
        } else {
            hexPrefix = NSNull()
        }
        return [
            "apnsCacheBytes": token?.count ?? 0,
            "apnsCacheHexPrefix": hexPrefix,
            "apnsRegisterError": lastError() as Any,
            "apnsOkAt": UserDefaults.standard.double(forKey: okAtKey),
            "apnsFailAt": UserDefaults.standard.double(forKey: failAtKey),
            "hasGoogleServiceInfoPlist": Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil,
        ]
    }

    /// Re-post so FirebaseMessagingPlugin.didRegister can set Messaging.apnsToken.
    static func rebroadcastToCapacitor() -> Bool {
        guard let token = current() else { return false }
        NotificationCenter.default.post(
            name: .capacitorDidRegisterForRemoteNotifications,
            object: token
        )
        return true
    }
}
