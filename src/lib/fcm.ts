import { Capacitor } from "@capacitor/core";
import { FirebaseMessaging } from "@capacitor-firebase/messaging";
import { setRemoteFcmToken, setRemoteDiagnosticHint } from "./la-remote";

let listenersBound = false;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchFcmTokenWithRetry(attempts = 12): Promise<string | null> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const { token } = await FirebaseMessaging.getToken();
      if (token) return token;
    } catch (err) {
      lastErr = err;
    }
    // APNs device token often arrives a moment after launch / plugin load.
    await sleep(750 * (i + 1));
  }
  if (lastErr) throw lastErr;
  return null;
}

/**
 * Wait until native Messaging has an APNs device token (or timeout).
 * Fixes the race where getToken() runs before AppDelegate's didRegister fires
 * and before the plugin applies the cached APNs token.
 */
async function waitForApnsToken(timeoutMs = 20_000): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    let handle: { remove: () => Promise<void> } | undefined;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      void handle?.remove();
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    void FirebaseMessaging.addListener("apnsTokenReceived", () => {
      clearTimeout(timer);
      finish(true);
    })
      .then((h) => {
        handle = h;
      })
      .catch(() => {
        clearTimeout(timer);
        finish(false);
      });
  });
}

/**
 * Request notification permission (if needed) and upload the FCM registration
 * token to Firestore via setRemoteFcmToken. Required for ActivityKit
 * push-to-start through Firebase Cloud Messaging.
 *
 * Note: @capacitor-firebase/app is intentionally NOT used. Its npm folder
 * basename ("app") collides with @capacitor/app in SwiftPM. FirebaseMessaging
 * configures FirebaseCore itself when GoogleService-Info.plist is present.
 */
export async function initFcmRegistration(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") {
    return;
  }

  try {
    const perm = await FirebaseMessaging.checkPermissions();
    if (perm.receive !== "granted") {
      const req = await FirebaseMessaging.requestPermissions();
      if (req.receive !== "granted") {
        setRemoteDiagnosticHint("FCM: notification permission not granted");
        return;
      }
    }

    // Triggers native registerForRemoteNotifications + APNs→Messaging.apnsToken.
    try {
      await FirebaseMessaging.requestPermissions();
    } catch {
      /* already granted */
    }

    if (!listenersBound) {
      listenersBound = true;
      await FirebaseMessaging.addListener("tokenReceived", (event) => {
        if (event.token) setRemoteFcmToken(event.token);
      });
      try {
        await FirebaseMessaging.addListener("apnsTokenReceived", () => {
          void fetchFcmTokenWithRetry(6).then((token) => {
            if (token) setRemoteFcmToken(token);
          });
        });
      } catch {
        /* older plugin builds may not expose this event */
      }
    }

    // Prefer waiting for APNs; still attempt getToken afterward either way.
    const apnsOk = await waitForApnsToken(12_000);
    if (!apnsOk) {
      console.warn("[fcm] APNs token not observed yet; retrying getToken anyway");
    }

    const token = await fetchFcmTokenWithRetry();
    if (token) {
      setRemoteFcmToken(token);
    } else {
      setRemoteDiagnosticHint(
        "FCM: getToken empty after retries. Check CapApp-SPM includes CapacitorFirebaseMessaging, GoogleService-Info.plist is in the IPA, and APNs Auth Key is in Firebase Console.",
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[fcm] registration failed:", msg);
    setRemoteDiagnosticHint(`FCM: ${msg}`);
  }
}
