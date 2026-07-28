import Foundation

/// Uploads Live Activity *update* push tokens to Firestore via HTTPS Cloud Function
/// without waiting for WKWebView / JS Firebase.
///
/// After push-to-start the server clears the previous update token. Silent minute
/// ticks and "予定時間になりました" need the new token in `devices/{uid}` ASAP.
/// ActivityKit may emit the token while the process is awake but JS is not ready
/// (suspended WebView, brief background wake). This uploader covers that gap.
enum LiveActivityTokenUploader {
    private static let deviceIdKey = "essences.laUploadDeviceId"
    private static let idTokenKey = "essences.laUploadIdToken"
    private static let uploadUrlKey = "essences.laUploadUrl"
    private static let lastUploadedTokenKey = "essences.laNativeUploadedUpdateToken"
    private static let lastUploadAtKey = "essences.laNativeUploadAt"
    private static let lastUploadOkKey = "essences.laNativeUploadOk"
    private static let lastUploadStatusKey = "essences.laNativeUploadStatus"

    private static let lock = NSLock()
    private static var inFlightToken: String?

    static func configure(deviceId: String, idToken: String, uploadUrl: String) {
        let defaults = UserDefaults.standard
        defaults.set(deviceId, forKey: deviceIdKey)
        defaults.set(idToken, forKey: idTokenKey)
        defaults.set(uploadUrl, forKey: uploadUrlKey)
        NSLog("[Essences LA] token upload context set device=%@", String(deviceId.prefix(8)))
        // Flush any token that arrived before JS authenticated.
        if #available(iOS 16.2, *), let token = LiveActivityRefreshCenter.currentUpdateToken {
            uploadIfNeeded(token: token)
        }
    }

    static func debugStatus() -> [String: Any] {
        let defaults = UserDefaults.standard
        return [
            "hasDeviceId": defaults.string(forKey: deviceIdKey) != nil,
            "hasIdToken": defaults.string(forKey: idTokenKey) != nil,
            "hasUploadUrl": defaults.string(forKey: uploadUrlKey) != nil,
            "lastNativeUploadOk": defaults.object(forKey: lastUploadOkKey) as? Bool as Any,
            "lastNativeUploadAt": defaults.object(forKey: lastUploadAtKey) as? Double as Any,
            "lastNativeUploadStatus": defaults.string(forKey: lastUploadStatusKey) as Any,
            "lastNativeUploadedPrefix": (defaults.string(forKey: lastUploadedTokenKey).map {
                String($0.prefix(12))
            }) as Any,
        ]
    }

    static func uploadIfNeeded(token: String) {
        let trimmed = token.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 32 else { return }

        let defaults = UserDefaults.standard
        if defaults.string(forKey: lastUploadedTokenKey) == trimmed,
           defaults.bool(forKey: lastUploadOkKey) {
            return
        }

        lock.lock()
        if inFlightToken == trimmed {
            lock.unlock()
            return
        }
        inFlightToken = trimmed
        lock.unlock()

        guard let deviceId = defaults.string(forKey: deviceIdKey),
              let idToken = defaults.string(forKey: idTokenKey),
              let urlString = defaults.string(forKey: uploadUrlKey),
              let url = URL(string: urlString),
              !deviceId.isEmpty,
              !idToken.isEmpty else {
            NSLog("[Essences LA] native updateToken upload deferred — missing auth context")
            lock.lock()
            inFlightToken = nil
            lock.unlock()
            defaults.set("missing-context", forKey: lastUploadStatusKey)
            defaults.set(false, forKey: lastUploadOkKey)
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(idToken)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 20
        let body: [String: Any] = [
            "deviceId": deviceId,
            "updateToken": trimmed,
            "source": "native",
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        let task = URLSession.shared.dataTask(with: request) { data, response, error in
            defer {
                lock.lock()
                if inFlightToken == trimmed { inFlightToken = nil }
                lock.unlock()
            }

            let status = (response as? HTTPURLResponse)?.statusCode ?? -1
            if let error {
                NSLog("[Essences LA] native updateToken upload error: %@", error.localizedDescription)
                defaults.set(false, forKey: lastUploadOkKey)
                defaults.set("error:\(error.localizedDescription)", forKey: lastUploadStatusKey)
                defaults.set(Date().timeIntervalSince1970 * 1000, forKey: lastUploadAtKey)
                return
            }

            let ok = (200..<300).contains(status)
            defaults.set(ok, forKey: lastUploadOkKey)
            defaults.set(Date().timeIntervalSince1970 * 1000, forKey: lastUploadAtKey)
            defaults.set("http:\(status)", forKey: lastUploadStatusKey)
            if ok {
                defaults.set(trimmed, forKey: lastUploadedTokenKey)
                NSLog("[Essences LA] native updateToken upload OK (http %d)", status)
            } else {
                let snippet = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
                NSLog(
                    "[Essences LA] native updateToken upload failed http=%d body=%@",
                    status,
                    String(snippet.prefix(160))
                )
            }
        }
        task.resume()
    }

    /// Best-effort harvest after push-to-start wake / background notification.
    static func harvestAfterWake() {
        guard #available(iOS 16.2, *) else { return }
        LiveActivityRefreshCenter.start()
        LiveActivityRefreshCenter.noteActivitiesChanged()
        Task.detached(priority: .utility) {
            if let token = await LiveActivityRefreshCenter.waitForUpdateToken(timeoutMs: 8_000) {
                uploadIfNeeded(token: token)
            }
        }
    }
}
