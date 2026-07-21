import { Capacitor } from "@capacitor/core";
import { FirebaseApp } from "@capacitor-firebase/app";
import { FirebaseMessaging } from "@capacitor-firebase/messaging";
import { setRemoteFcmToken, setRemoteDiagnosticHint } from "./la-remote";

let listenersBound = false;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchFcmTokenWithRetry(attempts = 6): Promise<string | null> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const { token } = await FirebaseMessaging.getToken();
      if (token) return token;
    } catch (err) {
      lastErr = err;
    }
    // APNs device token often arrives a moment after launch; wait and retry.
    await sleep(1500 * (i + 1));
  }
  if (lastErr) throw lastErr;
  return null;
}

/**
 * Request notification permission (if needed) and upload the FCM registration
 * token to Firestore via setRemoteFcmToken. Required for ActivityKit
 * push-to-start through Firebase Cloud Messaging.
 */
export async function initFcmRegistration(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") {
    return;
  }

  try {
    await FirebaseApp.getName();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[fcm] FirebaseApp not ready:", msg);
    setRemoteDiagnosticHint(`FirebaseApp: ${msg}`);
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

    // Ensure APNs registration runs after permission (pairs with AppDelegate).
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
          void fetchFcmTokenWithRetry(3).then((token) => {
            if (token) setRemoteFcmToken(token);
          });
        });
      } catch {
        /* older plugin builds may not expose this event */
      }
    }

    const token = await fetchFcmTokenWithRetry();
    if (token) {
      setRemoteFcmToken(token);
    } else {
      setRemoteDiagnosticHint("FCM: getToken empty after retries (waiting for APNs?)");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[fcm] registration failed:", msg);
    setRemoteDiagnosticHint(`FCM: ${msg}`);
  }
}
